ALTER TABLE decks
    ADD COLUMN set_id integer REFERENCES sets (id) ON DELETE SET NULL;

ALTER TABLE decks
    ADD COLUMN fabrary_format varchar(32);

CREATE INDEX decks_set_id_idx ON decks (set_id);
