CREATE TABLE user_card_rankings (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id integer NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    format smallint NOT NULL,
    rank smallint NOT NULL,
    notes varchar(2048),
    PRIMARY KEY (user_id, card_id, format)
);

CREATE INDEX user_card_rankings_user_id_idx ON user_card_rankings (user_id);
CREATE INDEX user_card_rankings_card_id_idx ON user_card_rankings (card_id);
CREATE INDEX user_card_rankings_format_idx ON user_card_rankings (format);
