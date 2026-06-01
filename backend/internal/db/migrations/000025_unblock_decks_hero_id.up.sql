-- Unblock deploy when decks exist but heroes was empty (000022 raised and left migrate dirty).
-- Safe to re-run: idempotent hero seed + hero_id completion.

-- 1) Hero cards from catalog.
INSERT INTO heroes (name, type, young, classes, talents, card_id, card_image_url, art_image_url)
SELECT
    c.name,
    c.heroes[1],
    COALESCE(54 = ANY (COALESCE(c.subtypes, ARRAY[]::smallint[])), false),
    c.classes,
    c.talents,
    c.id,
    COALESCE(NULLIF(TRIM(c.image_url), ''), cp.image_url),
    NULL
FROM cards c
LEFT JOIN LATERAL (
    SELECT cp.image_url
    FROM card_printings cp
    WHERE cp.card_id = c.id
    ORDER BY cp.id ASC
    LIMIT 1
) cp ON true
WHERE c.type = 8
  AND c.heroes IS NOT NULL
  AND cardinality(c.heroes) >= 1
  AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id);

-- 2) Stub heroes for legacy deck.hero enums still on decks (before column drop).
INSERT INTO heroes (name, type, young)
SELECT 'Hero ' || d.hero::text, d.hero, false
FROM (SELECT DISTINCT d.hero FROM decks d) d
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'hero'
)
AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.type = d.hero);

-- 3) Finish hero_id column migration if 000022 stopped partway.
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

UPDATE decks
SET hero_id = (SELECT MIN(id) FROM heroes)
WHERE hero_id IS NULL
  AND EXISTS (SELECT 1 FROM heroes);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM decks WHERE hero_id IS NULL) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'hero_id'
          AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE decks ALTER COLUMN hero_id SET NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'decks_hero_id_fkey'
    ) THEN
        ALTER TABLE decks
            ADD CONSTRAINT decks_hero_id_fkey FOREIGN KEY (hero_id) REFERENCES heroes (id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'hero'
    ) THEN
        DROP INDEX IF EXISTS decks_hero_idx;
        ALTER TABLE decks DROP COLUMN hero;
    END IF;

    CREATE INDEX IF NOT EXISTS decks_hero_id_idx ON decks (hero_id);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS heroes_card_id_unique ON heroes (card_id)
WHERE card_id IS NOT NULL;
