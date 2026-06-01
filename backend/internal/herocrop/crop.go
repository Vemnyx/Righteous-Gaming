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

// PortraitBanner is the default hero portrait strip size on FAB cards (width/height
// as fractions of the full card). Vertical position is adjusted per card via face
// detection so the hero's face sits near the vertical center of the crop.
var PortraitBanner = BannerSpec{
	X: 0.13,
	W: 0.74,
	H: 0.20,
	// Fallback center when no face is detected (typical adult hero art).
	FallbackCenterY: 0.30,
}

// BannerSpec describes a horizontal portrait strip whose vertical placement is
// computed per image.
type BannerSpec struct {
	X, W, H         float64
	FallbackCenterY float64
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

// faceCenter returns the best face center in source-image coordinates, or ok=false.
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

	// Prefer faces in the art band (below title, above rules text).
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

// BoundsForBanner returns pixel bounds for a face-centered portrait strip.
func (s BannerSpec) BoundsForBanner(img image.Image) image.Rectangle {
	b := img.Bounds()
	w := int(float64(b.Dx()) * s.W)
	h := int(float64(b.Dy()) * s.H)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}

	cx, cy, ok := faceCenter(img)
	if !ok {
		cx = b.Dx() / 2
		cy = int(float64(b.Dy()) * s.FallbackCenterY)
	}

	x0 := cx - w/2
	y0 := cy - h/2

	// Keep horizontal alignment with the card frame when possible.
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

// Crop extracts a face-centered portrait strip from src and encodes PNG bytes.
func Crop(src image.Image, spec BannerSpec) ([]byte, error) {
	rect := spec.BoundsForBanner(src)
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

// CropFromURL downloads an image and returns a face-centered portrait crop.
func CropFromURL(ctx context.Context, rawURL string, spec BannerSpec) ([]byte, error) {
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
	return Crop(img, spec)
}

func decodeImage(data []byte) (image.Image, string, error) {
	if img, err := webp.Decode(bytes.NewReader(data)); err == nil {
		return img, "webp", nil
	}
	return image.Decode(bytes.NewReader(data))
}
