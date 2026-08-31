DROP INDEX IF EXISTS play_testing_sessions_status_created_idx;

ALTER TABLE play_testing_sessions
    DROP CONSTRAINT IF EXISTS play_testing_sessions_status_check,
    DROP COLUMN IF EXISTS closed_at,
    DROP COLUMN IF EXISTS status;
