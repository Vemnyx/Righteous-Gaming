DROP INDEX IF EXISTS decks_deck_source_id_idx;

ALTER TABLE decks DROP COLUMN IF EXISTS deck_source_id;

DROP TABLE IF EXISTS deck_source;
