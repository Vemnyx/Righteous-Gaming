ALTER TABLE user_card_ratings DROP CONSTRAINT user_card_ratings_pkey;

DROP INDEX IF EXISTS user_card_ratings_user_rater_idx;
DROP INDEX IF EXISTS user_card_ratings_rater_id_idx;

ALTER TABLE user_card_ratings
    ADD COLUMN set_id integer,
    ADD COLUMN format smallint;

UPDATE user_card_ratings u
SET set_id = cr.set_id,
    format = cr.format
FROM card_rater cr
WHERE cr.id = u.rater_id;

ALTER TABLE user_card_ratings ALTER COLUMN set_id SET NOT NULL;
ALTER TABLE user_card_ratings ALTER COLUMN format SET NOT NULL;

ALTER TABLE user_card_ratings DROP COLUMN rater_id;

ALTER TABLE user_card_ratings ADD PRIMARY KEY (user_id, set_id, card_id, format);

CREATE INDEX IF NOT EXISTS user_card_ratings_set_id_idx ON user_card_ratings (set_id);
CREATE INDEX IF NOT EXISTS user_card_ratings_format_idx ON user_card_ratings (format);
CREATE INDEX IF NOT EXISTS user_card_ratings_user_set_format_idx ON user_card_ratings (user_id, set_id, format);

DROP TABLE IF EXISTS card_rater;
