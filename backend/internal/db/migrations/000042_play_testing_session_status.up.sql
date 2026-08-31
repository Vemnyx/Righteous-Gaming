ALTER TABLE play_testing_sessions
    ADD COLUMN status smallint NOT NULL DEFAULT 0,
    ADD COLUMN closed_at timestamptz,
    ADD CONSTRAINT play_testing_sessions_status_check CHECK (status IN (0, 1));

CREATE INDEX play_testing_sessions_status_created_idx
    ON play_testing_sessions (status ASC, created_at DESC);
