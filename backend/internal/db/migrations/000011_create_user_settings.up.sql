CREATE TABLE user_settings (
    user_id integer NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    card_rater_quick_submit boolean NOT NULL DEFAULT false
);
