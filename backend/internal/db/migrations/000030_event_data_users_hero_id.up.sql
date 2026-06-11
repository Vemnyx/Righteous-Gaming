ALTER TABLE event_data_users
    ADD COLUMN hero_id INT REFERENCES heroes (id) ON DELETE SET NULL;

CREATE INDEX event_data_users_hero_id_idx ON event_data_users (hero_id);
