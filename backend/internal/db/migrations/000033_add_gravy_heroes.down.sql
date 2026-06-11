DELETE FROM heroes
WHERE card_id IN (2005, 2006);

UPDATE cards
SET heroes = NULL
WHERE id IN (2005, 2006);
