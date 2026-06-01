-- Seed heroes from catalog hero cards (cards.type = CardTypeHero / 8).
-- heroes.type = first cards.heroes enum; young = Young subtype (54).

INSERT INTO heroes (name, type, young, classes, talents, card_id, card_image_url, art_image_url)
SELECT
    c.name,
    c.heroes[1],
    COALESCE(54 = ANY (COALESCE(c.subtypes, ARRAY[]::smallint[])), false),
    c.classes,
    c.talents,
    c.id,
    c.image_url,
    NULL
FROM cards c
WHERE c.type = 8
  AND c.heroes IS NOT NULL
  AND cardinality(c.heroes) >= 1
  AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id);
