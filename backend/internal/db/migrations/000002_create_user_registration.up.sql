CREATE TABLE user_registration (
    user_id integer NOT NULL,
    email varchar(320) NOT NULL,
    code varchar(128) NOT NULL,
    expire_at timestamptz NOT NULL,
    CONSTRAINT user_registration_user_id_key UNIQUE (user_id),
    CONSTRAINT user_registration_email_key UNIQUE (email),
    CONSTRAINT user_registration_code_key UNIQUE (code),
    CONSTRAINT user_registration_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX user_registration_code_idx ON user_registration (code);
