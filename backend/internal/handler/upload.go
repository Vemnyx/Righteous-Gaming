package handler

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/client"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const maxUploadFileBytes = 512 << 20
const maxUploadMultipartBytes = maxUploadFileBytes + (1 << 20) // room for multipart boundaries/fields
const maxUploadFileError = "exceeds maximum size of 512 MB"

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

// uploadAsset accepts multipart/form-data with fields "path" (object key under
// gs://righteous-assets) and "file". Requires Authorization: Bearer <Firebase
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

	if _, err := h.svc.UserForIDToken(r.Context(), idToken); err != nil {
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

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadMultipartBytes)
	if err := r.ParseMultipartForm(maxUploadMultipartBytes); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeFieldError(w, http.StatusBadRequest, "file", maxUploadFileError)
			return
		}
		writeMessageError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	objectPath, err := validateUploadObjectPath(r.FormValue("path"))
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "path", err.Error())
		return
	}

	fh, hdr, err := r.FormFile("file")
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "file", "required")
		return
	}
	defer func() { _ = fh.Close() }()

	if hdr.Size > maxUploadFileBytes {
		writeFieldError(w, http.StatusBadRequest, "file", maxUploadFileError)
		return
	}

	contentType := strings.TrimSpace(hdr.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	limited := &io.LimitedReader{R: fh, N: maxUploadFileBytes + 1}
	if err := h.app.UploadToGCS(r.Context(), objectPath, limited, contentType); err != nil {
		log.Error("upload asset gcs", "error", err, "path", objectPath)
		writeMessageError(w, http.StatusBadGateway, "upload failed")
		return
	}
	if limited.N <= 0 {
		writeFieldError(w, http.StatusBadRequest, "file", maxUploadFileError)
		return
	}

	writeCatalogJSON(w, http.StatusCreated, uploadAssetResponse{
		Path:      objectPath,
		PublicURL: gcsPublicObjectURL(objectPath),
	})
}
