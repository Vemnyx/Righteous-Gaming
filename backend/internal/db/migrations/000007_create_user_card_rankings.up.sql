CREATE TABLE user_card_ratings (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    set_id integer NOT NULL REFERENCES sets (id) ON DELETE CASCADE,
    card_id integer NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    format smallint NOT NULL,
    rating smallint NOT NULL,
    notes varchar(2048),
    PRIMARY KEY (user_id, set_id, card_id, format)
);

CREATE INDEX user_card_ratings_user_id_idx ON user_card_ratings (user_id);
CREATE INDEX user_card_ratings_set_id_idx ON user_card_ratings (set_id);
CREATE INDEX user_card_ratings_card_id_idx ON user_card_ratings (card_id);
CREATE INDEX user_card_ratings_format_idx ON user_card_ratings (format);
CREATE INDEX user_card_ratings_user_set_format_idx ON user_card_ratings (user_id, set_id, format);
