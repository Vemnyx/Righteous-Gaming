ALTER TABLE decks
    ADD COLUMN hero smallint;

UPDATE decks d
SET hero = h.type
FROM heroes h
WHERE h.id = d.hero_id;

ALTER TABLE decks
    ALTER COLUMN hero SET NOT NULL;

DROP INDEX IF EXISTS decks_hero_id_idx;

ALTER TABLE decks
    DROP CONSTRAINT IF EXISTS decks_hero_id_fkey;

ALTER TABLE decks
    DROP COLUMN hero_id;

CREATE INDEX decks_hero_idx ON decks (hero);
