DROP INDEX IF EXISTS event_data_users_hero_id_idx;

ALTER TABLE event_data_users DROP COLUMN IF EXISTS hero_id;
