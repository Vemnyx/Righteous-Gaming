CREATE TABLE event_data_users (
    id SERIAL PRIMARY KEY,
    event_data_id INT NOT NULL REFERENCES event_data (id) ON DELETE CASCADE,
    event_round_id INT NOT NULL REFERENCES event_rounds (id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    round_number INT NOT NULL CHECK (round_number > 0),
    kind TEXT NOT NULL CHECK (kind IN ('pairing', 'result', 'standing')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_round_id, user_id, kind)
);

CREATE INDEX event_data_users_event_data_id_idx ON event_data_users (event_data_id);
CREATE INDEX event_data_users_event_data_user_idx ON event_data_users (event_data_id, user_id);
CREATE INDEX event_data_users_user_id_idx ON event_data_users (user_id);
