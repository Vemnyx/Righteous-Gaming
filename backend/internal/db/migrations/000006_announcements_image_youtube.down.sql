ALTER TABLE announcements DROP COLUMN IF EXISTS youtube_url;
ALTER TABLE announcements RENAME COLUMN image_url TO thumbnail_url;
