ALTER TABLE play_testing_sessions
    DROP CONSTRAINT IF EXISTS play_testing_sessions_note_len_check;

ALTER TABLE play_testing_sessions
    DROP COLUMN IF EXISTS note;
