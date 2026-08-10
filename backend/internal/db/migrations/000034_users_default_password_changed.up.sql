ALTER TABLE users
  ADD COLUMN default_password_changed boolean NOT NULL DEFAULT false;

-- Existing accounts that already completed Firebase registration keep access without a forced reset.
UPDATE users
SET default_password_changed = true
WHERE uid IS NOT NULL AND btrim(uid) <> '';

DROP TABLE IF EXISTS user_registration;
