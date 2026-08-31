DROP INDEX IF EXISTS release_team_notes_session_hero_user_uidx;

ALTER TABLE release_team_notes
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS draft_body;
