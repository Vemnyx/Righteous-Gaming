ALTER TABLE play_testing_sessions
    ADD COLUMN note text NOT NULL DEFAULT '';

ALTER TABLE play_testing_sessions
    ADD CONSTRAINT play_testing_sessions_note_len_check CHECK (char_length(note) <= 500);
