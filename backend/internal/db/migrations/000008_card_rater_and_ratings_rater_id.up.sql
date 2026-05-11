CREATE TABLE card_rater (
    id SERIAL PRIMARY KEY,
    set_id integer NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
    format smallint NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- At most one incomplete (active) rater row globally.
CREATE UNIQUE INDEX card_rater_one_active ON card_rater ((1)) WHERE completed_at IS NULL;

ALTER TABLE user_card_ratings
    ADD COLUMN rater_id integer REFERENCES card_rater (id) ON DELETE RESTRICT;

INSERT INTO card_rater (set_id, format, started_at, completed_at)
SELECT set_id, format, now(), now()
FROM user_card_ratings
GROUP BY set_id, format;

UPDATE user_card_ratings u
SET rater_id = cr.id
FROM card_rater cr
WHERE cr.set_id = u.set_id AND cr.format = u.format;

ALTER TABLE user_card_ratings ALTER COLUMN rater_id SET NOT NULL;

ALTER TABLE user_card_ratings DROP CONSTRAINT user_card_ratings_pkey;

DROP INDEX user_card_ratings_set_id_idx;
DROP INDEX user_card_ratings_format_idx;
DROP INDEX user_card_ratings_user_set_format_idx;

ALTER TABLE user_card_ratings DROP COLUMN set_id;
ALTER TABLE user_card_ratings DROP COLUMN format;

ALTER TABLE user_card_ratings ADD PRIMARY KEY (user_id, rater_id, card_id);

CREATE INDEX user_card_ratings_rater_id_idx ON user_card_ratings (rater_id);
CREATE INDEX user_card_ratings_user_rater_idx ON user_card_ratings (user_id, rater_id);
