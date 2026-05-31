ALTER TABLE cards
    ADD COLUMN image_url varchar(1024),
    ADD COLUMN rarity smallint,
    ADD COLUMN set_code varchar(3),
    ADD COLUMN set_num smallint;

UPDATE cards c
SET
    image_url = cp.image_url,
    rarity = cp.rarity,
    set_code = cp.set_code,
    set_num = cp.set_num
FROM (
    SELECT DISTINCT ON (card_id)
        card_id,
        set_code,
        set_num,
        rarity,
        image_url
    FROM card_printings
    ORDER BY card_id, id ASC
) cp
WHERE cp.card_id = c.id;

ALTER TABLE cards
    ALTER COLUMN set_code SET NOT NULL,
    ALTER COLUMN set_num SET NOT NULL;

CREATE INDEX cards_rarity_idx ON cards (rarity);

DROP TABLE IF EXISTS card_printings;
