DROP INDEX IF EXISTS event_data_users_opponent_hero_id_idx;

ALTER TABLE event_data_users DROP COLUMN IF EXISTS opponent_hero_id;
