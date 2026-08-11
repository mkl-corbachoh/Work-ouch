CREATE TABLE users (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id > 0
      AND id <= 9007199254740991
    ),
  email TEXT NOT NULL COLLATE BINARY UNIQUE
    CHECK (length(email) > 0 AND email = trim(email)),
  display_name TEXT NOT NULL
    CHECK (length(display_name) > 0 AND display_name = trim(display_name)),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0 AND updated_at = trim(updated_at))
) STRICT;
