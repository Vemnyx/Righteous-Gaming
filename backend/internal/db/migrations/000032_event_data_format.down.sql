ALTER TABLE event_data DROP CONSTRAINT IF EXISTS event_data_format_check;
ALTER TABLE event_data DROP COLUMN IF EXISTS format;
