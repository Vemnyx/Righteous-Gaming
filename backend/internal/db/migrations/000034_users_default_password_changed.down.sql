CREATE TABLE user_registration (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email varchar(320) NOT NULL,
    code varchar(64) NOT NULL,
    expire_at timestamptz NOT NULL,
    CONSTRAINT user_registration_user_id_key UNIQUE (user_id),
    CONSTRAINT user_registration_code_key UNIQUE (code)
);

CREATE INDEX user_registration_code_idx ON user_registration (code);

ALTER TABLE users DROP COLUMN IF EXISTS default_password_changed;
