-- Draft vs published notes: body stays the live (published) content;
-- draft_body is the author's working copy until they publish.
ALTER TABLE release_team_notes
    ADD COLUMN draft_body text,
    ADD COLUMN published_at timestamptz;

-- Existing notes were already live; seed draft from body and mark published.
UPDATE release_team_notes
SET draft_body = body,
    published_at = COALESCE(updated_at, created_at)
WHERE draft_body IS NULL;

ALTER TABLE release_team_notes
    ALTER COLUMN draft_body SET DEFAULT '',
    ALTER COLUMN draft_body SET NOT NULL;

CREATE UNIQUE INDEX release_team_notes_session_hero_user_uidx
    ON release_team_notes (session_id, hero_id, user_id);
