ALTER TABLE announcements RENAME COLUMN thumbnail_url TO image_url;
ALTER TABLE announcements ADD COLUMN youtube_url TEXT;
