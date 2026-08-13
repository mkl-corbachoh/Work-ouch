CREATE TABLE user_identities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL COLLATE BINARY CHECK (length(provider) > 0 AND provider = trim(provider)),
  provider_subject TEXT NOT NULL COLLATE BINARY CHECK (length(provider_subject) > 0 AND provider_subject = trim(provider_subject)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX user_identities_user_id_idx ON user_identities(user_id);
