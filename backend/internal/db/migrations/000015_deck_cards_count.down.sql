ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_count_positive;

ALTER TABLE deck_cards DROP COLUMN IF EXISTS count;
