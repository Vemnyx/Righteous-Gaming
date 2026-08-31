-- Primary (0) / Secondary (1) assignment for release team members.
ALTER TABLE release_team_members
    ADD COLUMN slot smallint NOT NULL DEFAULT 0;

ALTER TABLE release_team_members
    ADD CONSTRAINT release_team_members_slot_check CHECK (slot IN (0, 1));
