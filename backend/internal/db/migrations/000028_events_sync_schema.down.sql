DROP TABLE IF EXISTS event_data_comments;
DROP TABLE IF EXISTS event_rounds;
DROP TABLE IF EXISTS event_data;

CREATE TABLE event_streams (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    day_number SMALLINT NOT NULL CHECK (day_number BETWEEN 1 AND 3),
    url TEXT NOT NULL,
    label TEXT,
    coverage_slug TEXT NOT NULL,
    youtube_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, day_number)
);

CREATE INDEX event_streams_event_id_idx ON event_streams (event_id);

CREATE TABLE event_stream_comments (
    id SERIAL PRIMARY KEY,
    event_stream_id INT NOT NULL REFERENCES event_streams (id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    comment TEXT NOT NULL CHECK (char_length(trim(comment)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_stream_comments_stream_id_idx ON event_stream_comments (event_stream_id);

ALTER TABLE events ADD COLUMN day_count SMALLINT NOT NULL DEFAULT 1 CHECK (day_count BETWEEN 1 AND 3);
ALTER TABLE events DROP COLUMN IF EXISTS start_date;
ALTER TABLE events DROP COLUMN IF EXISTS end_date;
