-- Gravy Bones hero cards were missing heroes[] on insert; backfill enum and seed hero rows.

UPDATE cards
SET heroes = ARRAY[28::smallint]
WHERE id IN (2005, 2006)
  AND (heroes IS NULL OR cardinality(heroes) = 0);

INSERT INTO heroes (name, type, young, classes, talents, card_id, card_image_url, art_image_url)
SELECT
    'Gravy',
    28,
    true,
    c.classes,
    c.talents,
    c.id,
    'https://content.fabrary.net/cards/AGB002.webp',
    NULL
FROM cards c
WHERE c.id = 2005
  AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id);

INSERT INTO heroes (name, type, young, classes, talents, card_id, card_image_url, art_image_url)
SELECT
    c.name,
    28,
    false,
    c.classes,
    c.talents,
    c.id,
    'https://content.fabrary.net/cards/AGB001.webp',
    NULL
FROM cards c
WHERE c.id = 2006
  AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id);
