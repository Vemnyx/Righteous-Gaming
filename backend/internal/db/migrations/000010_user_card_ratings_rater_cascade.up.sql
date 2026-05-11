ALTER TABLE user_card_ratings DROP CONSTRAINT IF EXISTS user_card_ratings_rater_id_fkey;

ALTER TABLE user_card_ratings
    ADD CONSTRAINT user_card_ratings_rater_id_fkey
    FOREIGN KEY (rater_id) REFERENCES card_rater (id) ON DELETE CASCADE;
