ALTER TABLE event_data
    ADD COLUMN format SMALLINT;

ALTER TABLE event_data
    ADD CONSTRAINT event_data_format_check CHECK (format IS NULL OR (format >= 0 AND format <= 4));
