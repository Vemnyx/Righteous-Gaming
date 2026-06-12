package handler

import (
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/client"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const maxUploadFileBytes = 1 << 30
const maxUploadMultipartBytes = maxUploadFileBytes + (1 << 20) // room for multipart boundaries/fields
const maxUploadFileError = "exceeds maximum size of 1 GB"
const maxUploadPathFieldBytes = 2048
const uploadRequestTimeout = 2 * time.Hour

type uploadHTTP struct {
	app *app.App
	svc *service.UserService
}

type uploadAssetResponse struct {
	Path      string `json:"path"`
	PublicURL string `json:"public_url"`
}

func gcsPublicObjectURL(objectPath string) string {
	segs := strings.Split(objectPath, "/")
	var b strings.Builder
	b.WriteString("https://storage.googleapis.com/")
	b.WriteString(url.PathEscape(client.AssetsBucketName))
	for _, seg := range segs {
		if seg == "" {
			continue
		}
		b.WriteByte('/')
		b.WriteString(url.PathEscape(seg))
	}
	return b.String()
}

func validateUploadObjectPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	p = strings.TrimLeft(p, "/")
	if p == "" {
		return "", errors.New("path is required")
	}
	if strings.Contains(p, "..") || strings.Contains(p, "\\") {
		return "", errors.New("invalid path")
	}
	return p, nil
}

func multipartContentType(part *multipart.Part) string {
	contentType := strings.TrimSpace(part.Header.Get("Content-Type"))
	if contentType == "" {
		return "application/octet-stream"
	}
	return contentType
}

func drainPart(part *multipart.Part, limit int64) {
	_, _ = io.Copy(io.Discard, &io.LimitedReader{R: part, N: limit})
	_ = part.Close()
}

// uploadAsset accepts multipart/form-data with fields "path" (object key under
// gs://righteous-assets) and "file". The file part is streamed to GCS without
// buffering the whole body in memory. Requires Authorization: Bearer <Firebase
// ID token> for any registered user (not restricted to admins).
func (h *uploadHTTP) uploadAsset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	u, err := h.svc.UserForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("upload asset session check", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if !requireWriteAccess(w, u) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadMultipartBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	var objectPath string
	var fileUploaded bool
	var fileTooLarge bool

	uploadCtx, cancel := context.WithTimeout(r.Context(), uploadRequestTimeout)
	defer cancel()

	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				writeFieldError(w, http.StatusBadRequest, "file", maxUploadFileError)
				return
			}
			writeMessageError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}

		switch part.FormName() {
		case "path":
			raw, readErr := io.ReadAll(io.LimitReader(part, maxUploadPathFieldBytes))
			_ = part.Close()
			if readErr != nil {
				writeMessageError(w, http.StatusBadRequest, "invalid multipart form")
				return
			}
			objectPath, err = validateUploadObjectPath(string(raw))
			if err != nil {
				writeFieldError(w, http.StatusBadRequest, "path", err.Error())
				return
			}
		case "file":
			if fileUploaded {
				drainPart(part, maxUploadFileBytes+1)
				continue
			}
			if objectPath == "" {
				drainPart(part, maxUploadFileBytes+1)
				writeFieldError(w, http.StatusBadRequest, "path", "required")
				return
			}

			limited := &io.LimitedReader{R: part, N: maxUploadFileBytes + 1}
			if err := h.app.UploadToGCS(uploadCtx, objectPath, limited, multipartContentType(part)); err != nil {
				_ = part.Close()
				log.Error("upload asset gcs", "error", err, "path", objectPath)
				writeMessageError(w, http.StatusBadGateway, "upload failed")
				return
			}
			_ = part.Close()
			if limited.N <= 0 {
				fileTooLarge = true
			} else {
				fileUploaded = true
			}
		default:
			drainPart(part, maxUploadFileBytes+1)
		}
	}

	if fileTooLarge {
		writeFieldError(w, http.StatusBadRequest, "file", maxUploadFileError)
		return
	}
	if objectPath == "" {
		writeFieldError(w, http.StatusBadRequest, "path", "required")
		return
	}
	if !fileUploaded {
		writeFieldError(w, http.StatusBadRequest, "file", "required")
		return
	}

	writeCatalogJSON(w, http.StatusCreated, uploadAssetResponse{
		Path:      objectPath,
		PublicURL: gcsPublicObjectURL(objectPath),
	})
}
