package herocrop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFaceCenteredCropNonEmpty(t *testing.T) {
	path := os.Getenv("HERO_CROP_TEST_IMAGE")
	if path == "" {
		t.Skip("set HERO_CROP_TEST_IMAGE to run")
	}
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatal(err)
	}
	img, _, err := decodeImage(data)
	if err != nil {
		t.Fatal(err)
	}
	cropped, err := Crop(img, PortraitBanner)
	if err != nil {
		t.Fatal(err)
	}
	if len(cropped) < 1000 {
		t.Fatalf("crop too small: %d bytes", len(cropped))
	}
	if out := os.Getenv("HERO_CROP_TEST_OUT"); out != "" {
		if err := os.WriteFile(out, cropped, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
