-- New Fabrary releases / set codes (Usurp the Shadow Throne era).
-- Sources: fabrary/cards packages/types sets.ts + Release enum.

UPDATE sets
SET name = 'Usurp the Shadow Throne'
WHERE lower(code) = 'iar'
  AND name IN ('IAR', 'iar');

INSERT INTO sets (name, code, image_url)
SELECT v.name, v.code, v.image_url
FROM (
    VALUES
    ('Armory Deck: Malice', 'ama', NULL),
    ('Armory Deck: Dr. Mortimer', 'amo', NULL),
    ('Mastery Pack: Assassin', 'mpa', NULL),
    ('Prism Silver Age Deck', 'sat', NULL),
    ('Viserai Between Worlds Silver Age Deck', 'sbw', NULL),
    ('Smash Palace: Chorus of Steel', 'spw', NULL)
) AS v(name, code, image_url)
WHERE NOT EXISTS (
    SELECT 1 FROM sets s WHERE s.code = v.code
);
