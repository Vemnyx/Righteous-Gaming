ALTER TABLE event_data_users
    ADD COLUMN opponent_hero_id INT REFERENCES heroes (id) ON DELETE SET NULL;

CREATE INDEX event_data_users_opponent_hero_id_idx ON event_data_users (opponent_hero_id);
