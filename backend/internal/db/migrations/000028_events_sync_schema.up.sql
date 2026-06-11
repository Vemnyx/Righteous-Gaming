ALTER TABLE events ADD COLUMN start_date TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN end_date TIMESTAMPTZ;
ALTER TABLE events DROP COLUMN day_count;

DROP TABLE IF EXISTS event_stream_comments;
DROP TABLE IF EXISTS event_streams;

CREATE TABLE event_data (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    event_type SMALLINT NOT NULL CHECK (event_type BETWEEN 1 AND 4),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    coverage_slug TEXT NOT NULL,
    coverage_url TEXT NOT NULL,
    label TEXT,
    stream_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_data_event_id_idx ON event_data (event_id);
CREATE INDEX event_data_active_idx ON event_data (start_date, end_date);

CREATE TABLE event_rounds (
    id SERIAL PRIMARY KEY,
    event_data_id INT NOT NULL REFERENCES event_data (id) ON DELETE CASCADE,
    round_number INT NOT NULL CHECK (round_number > 0),
    round_label TEXT,
    pairings JSONB NOT NULL DEFAULT '[]'::jsonb,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    standings JSONB NOT NULL DEFAULT '[]'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_data_id, round_number)
);

CREATE INDEX event_rounds_event_data_id_idx ON event_rounds (event_data_id);

CREATE TABLE event_data_comments (
    id SERIAL PRIMARY KEY,
    event_data_id INT NOT NULL REFERENCES event_data (id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    comment TEXT NOT NULL CHECK (char_length(trim(comment)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_data_comments_event_data_id_idx ON event_data_comments (event_data_id);
