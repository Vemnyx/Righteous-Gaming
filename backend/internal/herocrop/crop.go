package herocrop

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	pigo "github.com/esimov/pigo/core"
	"golang.org/x/image/webp"
)

//go:embed cascade/facefinder
var faceCascadeData []byte

// PortraitBanner is the default hero portrait strip size on FAB cards.
var PortraitBanner = BannerSpec{
	X:               0.13,
	W:               0.74,
	H:               0.20,
	FallbackCenterY: 0.30,
}

// BannerSpec describes a horizontal portrait strip whose vertical placement is computed per image.
type BannerSpec struct {
	X, W, H         float64
	FallbackCenterY float64
}

// NormPoint is a normalized center (0–1) within the card image.
type NormPoint struct {
	X, Y float64
}

var (
	faceClassifier     *pigo.Pigo
	faceClassifierOnce sync.Once
	faceClassifierErr  error
)

func faceDetector() (*pigo.Pigo, error) {
	faceClassifierOnce.Do(func() {
		p := pigo.NewPigo()
		faceClassifier, faceClassifierErr = p.Unpack(faceCascadeData)
	})
	return faceClassifier, faceClassifierErr
}

func faceCenter(img image.Image) (cx, cy int, ok bool) {
	classifier, err := faceDetector()
	if err != nil || classifier == nil {
		return 0, 0, false
	}

	b := img.Bounds()
	cols, rows := b.Dx(), b.Dy()
	if cols < 40 || rows < 40 {
		return 0, 0, false
	}

	pixels := pigo.RgbToGrayscale(img)
	cParams := pigo.CascadeParams{
		MinSize:     20,
		MaxSize:     1000,
		ShiftFactor: 0.1,
		ScaleFactor: 1.1,
		ImageParams: pigo.ImageParams{
			Pixels: pixels,
			Rows:   rows,
			Cols:   cols,
			Dim:    cols,
		},
	}

	dets := classifier.RunCascade(cParams, 0.0)
	dets = classifier.ClusterDetections(dets, 0.15)
	if len(dets) == 0 {
		return 0, 0, false
	}

	minY := int(float64(rows) * 0.08)
	maxY := int(float64(rows) * 0.62)

	var best *pigo.Detection
	bestScore := -1.0
	for i := range dets {
		d := &dets[i]
		if d.Q < 4.0 {
			continue
		}
		if d.Row < minY || d.Row > maxY {
			continue
		}
		score := float64(d.Q) * float64(d.Scale)
		if score > bestScore {
			bestScore = score
			best = d
		}
	}
	if best == nil {
		for i := range dets {
			d := &dets[i]
			if d.Q < 4.0 {
				continue
			}
			score := float64(d.Q) * float64(d.Scale)
			if score > bestScore {
				bestScore = score
				best = d
			}
		}
	}
	if best == nil {
		return 0, 0, false
	}

	return best.Col, best.Row, true
}

func clampNorm(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// Bounds returns pixel bounds for a portrait strip.
func (s BannerSpec) Bounds(img image.Image, center *NormPoint) image.Rectangle {
	b := img.Bounds()
	w := int(float64(b.Dx()) * s.W)
	h := int(float64(b.Dy()) * s.H)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}

	var cx, cy int
	switch {
	case center != nil:
		cx = int(float64(b.Dx()) * clampNorm(center.X))
		cy = int(float64(b.Dy()) * clampNorm(center.Y))
	default:
		if fx, fy, ok := faceCenter(img); ok {
			cx, cy = fx, fy
		} else {
			cx = b.Dx() / 2
			cy = int(float64(b.Dy()) * s.FallbackCenterY)
		}
	}

	x0 := cx - w/2
	y0 := cy - h/2

	frameX := int(float64(b.Dx()) * s.X)
	if x0 < frameX {
		x0 = frameX
	}
	maxX := b.Dx() - w
	if x0 > maxX {
		x0 = maxX
	}
	if x0 < b.Min.X {
		x0 = b.Min.X
	}

	if y0 < b.Min.Y {
		y0 = b.Min.Y
	}
	maxY := b.Dy() - h
	if y0 > maxY {
		y0 = maxY
	}

	return image.Rect(x0, y0, x0+w, y0+h)
}

// Crop extracts a portrait strip from src and encodes PNG bytes.
func Crop(src image.Image, spec BannerSpec, center *NormPoint) ([]byte, error) {
	rect := spec.Bounds(src, center)
	if rect.Empty() {
		return nil, fmt.Errorf("herocrop: empty crop bounds")
	}

	sub, ok := src.(interface {
		SubImage(r image.Rectangle) image.Image
	})
	if !ok {
		return nil, fmt.Errorf("herocrop: image does not support SubImage")
	}
	cropped := sub.SubImage(rect)

	var buf bytes.Buffer
	if err := png.Encode(&buf, cropped); err != nil {
		return nil, fmt.Errorf("herocrop: encode png: %w", err)
	}
	return buf.Bytes(), nil
}

// CropFromURL downloads an image and returns a portrait crop.
func CropFromURL(ctx context.Context, rawURL string, spec BannerSpec, center *NormPoint) ([]byte, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, fmt.Errorf("herocrop: empty url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("herocrop: build request: %w", err)
	}
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("herocrop: fetch: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("herocrop: fetch HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if err != nil {
		return nil, fmt.Errorf("herocrop: read image: %w", err)
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("herocrop: empty image")
	}
	img, _, err := decodeImage(body)
	if err != nil {
		return nil, fmt.Errorf("herocrop: decode image: %w", err)
	}
	return Crop(img, spec, center)
}

func decodeImage(data []byte) (image.Image, string, error) {
	if img, err := webp.Decode(bytes.NewReader(data)); err == nil {
		return img, "webp", nil
	}
	return image.Decode(bytes.NewReader(data))
}

// ObjectSlug builds a GCS object name segment from a card identifier or hero id.
func ObjectSlug(cardIdentifier *string, heroID int) string {
	if cardIdentifier != nil {
		if s := slugify(*cardIdentifier); s != "" {
			return s
		}
	}
	return fmt.Sprintf("hero-%d", heroID)
}

// ObjectPath returns the heroes/art object key for a hero portrait PNG.
func ObjectPath(cardIdentifier *string, heroID int) string {
	slug := ObjectSlug(cardIdentifier, heroID)
	return "heroes/art/" + slug + fmt.Sprintf("-%d.png", heroID)
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
