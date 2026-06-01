-- Idempotent repair when 000022 failed partway or raised on strict backfill.
-- Safe to run after a successful 000022 (no-op).

ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS hero_id integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'hero'
    ) THEN
        RETURN;
    END IF;

    UPDATE decks d
    SET hero_id = (
        SELECT h.id
        FROM heroes h
        WHERE h.type = d.hero
        ORDER BY h.young ASC, h.id ASC
        LIMIT 1
    )
    WHERE d.hero_id IS NULL;

    UPDATE decks
    SET hero_id = (SELECT MIN(id) FROM heroes)
    WHERE hero_id IS NULL
      AND EXISTS (SELECT 1 FROM heroes);

    IF EXISTS (SELECT 1 FROM decks WHERE hero_id IS NULL) THEN
        IF EXISTS (SELECT 1 FROM decks) AND NOT EXISTS (SELECT 1 FROM heroes) THEN
            RAISE EXCEPTION 'decks.hero_id backfill failed: heroes table is empty (run migration 000021 first)';
        END IF;
    END IF;

    ALTER TABLE decks ALTER COLUMN hero_id SET NOT NULL;

    ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_hero_id_fkey;
    ALTER TABLE decks ADD CONSTRAINT decks_hero_id_fkey FOREIGN KEY (hero_id) REFERENCES heroes (id);

    DROP INDEX IF EXISTS decks_hero_idx;
    ALTER TABLE decks DROP COLUMN hero;

    CREATE INDEX IF NOT EXISTS decks_hero_id_idx ON decks (hero_id);
END $$;
