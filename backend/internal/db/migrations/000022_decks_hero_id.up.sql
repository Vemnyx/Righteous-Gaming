ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS hero_id integer;

UPDATE decks d
SET hero_id = (
    SELECT h.id
    FROM heroes h
    WHERE h.type = d.hero
    ORDER BY h.young ASC, h.id ASC
    LIMIT 1
)
WHERE d.hero_id IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'hero'
  );

-- Stub heroes for deck enums not yet in heroes (e.g. catalog has no hero cards yet).
INSERT INTO heroes (name, type, young)
SELECT 'Hero ' || d.hero::text, d.hero, false
FROM (SELECT DISTINCT d.hero FROM decks d) d
WHERE NOT EXISTS (SELECT 1 FROM heroes h WHERE h.type = d.hero);

-- Fallback when no heroes row matches the legacy enum (prefer any hero over blocking deploy).
UPDATE decks
SET hero_id = (SELECT MIN(id) FROM heroes)
WHERE hero_id IS NULL
  AND EXISTS (SELECT 1 FROM heroes);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM decks WHERE hero_id IS NULL) THEN
        RETURN;
    END IF;

    ALTER TABLE decks
        ALTER COLUMN hero_id SET NOT NULL;

    ALTER TABLE decks
        DROP CONSTRAINT IF EXISTS decks_hero_id_fkey;

    ALTER TABLE decks
        ADD CONSTRAINT decks_hero_id_fkey FOREIGN KEY (hero_id) REFERENCES heroes (id);

    DROP INDEX IF EXISTS decks_hero_idx;

    ALTER TABLE decks
        DROP COLUMN IF EXISTS hero;

    CREATE INDEX IF NOT EXISTS decks_hero_id_idx ON decks (hero_id);
END $$;
