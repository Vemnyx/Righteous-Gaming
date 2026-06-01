-- Idempotent: seed any hero cards missing from heroes (e.g. 000021 ran before catalog had hero cards).
-- Uses primary printing image when cards.image_url is empty.

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

CREATE UNIQUE INDEX IF NOT EXISTS heroes_card_id_unique ON heroes (card_id)
WHERE card_id IS NOT NULL;
