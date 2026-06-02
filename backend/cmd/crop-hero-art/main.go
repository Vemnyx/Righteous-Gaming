package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"os"
	"path"

	"righteous-gaming/backend/internal/client"
	"righteous-gaming/backend/internal/db"
	"righteous-gaming/backend/internal/herocrop"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

func main() {
	var (
		dryRun = flag.Bool("dry-run", false, "crop only; do not upload or update database")
		limit  = flag.Int("limit", 0, "max heroes to process (0 = all)")
		heroID = flag.Int("hero-id", 0, "process only this heroes.id (0 = all)")
		skipDB = flag.Bool("skip-db", false, "upload only; do not update heroes.art_image_url")
		outDir = flag.String("out-dir", "", "if set, also write PNG crops to this local directory")
	)
	flag.Parse()

	ctx := context.Background()
	cfg, err := db.LoadConfig(ctx)
	if err != nil {
		log.Fatal("db config", "error", err)
	}
	repo, err := repository.New(ctx, cfg)
	if err != nil {
		log.Fatal("db connect", "error", err)
	}
	defer repo.Close()

	rows, err := repo.ListHeroesForArtCrop(ctx)
	if err != nil {
		log.Fatal("list heroes", "error", err)
	}
	if *heroID > 0 {
		filtered := rows[:0]
		for _, row := range rows {
			if row.HeroID == *heroID {
				filtered = append(filtered, row)
			}
		}
		rows = filtered
	}
	if len(rows) == 0 {
		log.Info("no heroes with card_image_url")
		return
	}

	var gcs *client.GCS
	if !*dryRun {
		gcs, err = client.NewGCS(ctx)
		if err != nil {
			log.Fatal("gcs client", "error", err)
		}
		defer gcs.Close()
	}

	processed := 0
	uploaded := 0
	failed := 0
	var failSamples []string

	for _, row := range rows {
		if *limit > 0 && processed >= *limit {
			break
		}
		processed++

		var center *herocrop.NormPoint
		if row.CropCenterX != nil && row.CropCenterY != nil {
			center = &herocrop.NormPoint{X: *row.CropCenterX, Y: *row.CropCenterY}
		}

		pngBytes, err := herocrop.CropFromURL(ctx, row.CardImageURL, herocrop.PortraitBanner, center)
		if err != nil {
			failed++
			if len(failSamples) < 5 {
				failSamples = append(failSamples, fmt.Sprintf("hero_id=%d: %v", row.HeroID, err))
			}
			log.Error("crop failed", "hero_id", row.HeroID, "error", err)
			continue
		}

		objectPath := herocrop.ObjectPath(row.CardIdentifier, row.HeroID)
		publicURL := client.AssetsPublicURL(objectPath)

		if *outDir != "" {
			slug := herocrop.ObjectSlug(row.CardIdentifier, row.HeroID)
			localPath := path.Join(*outDir, fmt.Sprintf("%s-%d.png", slug, row.HeroID))
			if err := os.WriteFile(localPath, pngBytes, 0o644); err != nil {
				log.Error("write local crop", "path", localPath, "error", err)
			}
		}

		if *dryRun {
			log.Info("dry-run crop ok", "hero_id", row.HeroID, "object", objectPath, "bytes", len(pngBytes))
			continue
		}

		if err := gcs.Upload(ctx, objectPath, bytes.NewReader(pngBytes), "image/png"); err != nil {
			failed++
			if len(failSamples) < 5 {
				failSamples = append(failSamples, fmt.Sprintf("hero_id=%d upload: %v", row.HeroID, err))
			}
			log.Error("upload failed", "hero_id", row.HeroID, "error", err)
			continue
		}
		uploaded++

		if !*skipDB {
			cx, cy := 0.5, herocrop.PortraitBanner.FallbackCenterY
			if center != nil {
				cx, cy = center.X, center.Y
			}
			if err := repo.UpdateHeroArtCrop(ctx, row.HeroID, publicURL, cx, cy); err != nil {
				failed++
				log.Error("db update failed", "hero_id", row.HeroID, "error", err)
				continue
			}
			log.Info("hero art updated", "hero_id", row.HeroID, "url", publicURL)
		}
	}

	log.Info("crop hero art done",
		"eligible", len(rows),
		"processed", processed,
		"uploaded", uploaded,
		"failed", failed,
		"dry_run", *dryRun,
		"sample_errors", failSamples,
	)
}
