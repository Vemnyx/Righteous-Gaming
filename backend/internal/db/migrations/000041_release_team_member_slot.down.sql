ALTER TABLE release_team_members
    DROP CONSTRAINT IF EXISTS release_team_members_slot_check;

ALTER TABLE release_team_members
    DROP COLUMN IF EXISTS slot;
