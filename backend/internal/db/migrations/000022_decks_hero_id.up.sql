ALTER TABLE decks
    ADD COLUMN hero_id integer;

UPDATE decks d
SET hero_id = (
    SELECT h.id
    FROM heroes h
    WHERE h.type = d.hero
    ORDER BY h.young ASC, h.id ASC
    LIMIT 1
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM decks WHERE hero_id IS NULL) THEN
        RAISE EXCEPTION 'decks.hero_id backfill failed: ensure migration 000021 ran and heroes exist for each deck hero type';
    END IF;
END $$;

ALTER TABLE decks
    ALTER COLUMN hero_id SET NOT NULL;

ALTER TABLE decks
    ADD CONSTRAINT decks_hero_id_fkey FOREIGN KEY (hero_id) REFERENCES heroes (id);

DROP INDEX IF EXISTS decks_hero_idx;

ALTER TABLE decks
    DROP COLUMN hero;

CREATE INDEX decks_hero_id_idx ON decks (hero_id);
