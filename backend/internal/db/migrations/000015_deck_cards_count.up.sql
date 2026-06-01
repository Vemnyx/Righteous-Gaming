ALTER TABLE deck_cards
    ADD COLUMN count integer NOT NULL DEFAULT 1;

ALTER TABLE deck_cards
    ADD CONSTRAINT deck_cards_count_positive CHECK (count > 0);
