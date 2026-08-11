CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL COLLATE BINARY UNIQUE
    CHECK (
      length(slug) BETWEEN 1 AND 100
      AND slug = trim(slug)
      AND slug NOT GLOB '*[^a-z0-9-]*'
      AND slug NOT GLOB '-*'
      AND slug NOT GLOB '*-'
      AND slug NOT GLOB '*--*'
    ),
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 200 AND name = trim(name)),
  movement_pattern TEXT
    CHECK (
      movement_pattern IS NULL
      OR (length(movement_pattern) BETWEEN 1 AND 100 AND movement_pattern = trim(movement_pattern))
    ),
  equipment TEXT
    CHECK (
      equipment IS NULL
      OR (length(equipment) BETWEEN 1 AND 100 AND equipment = trim(equipment))
    ),
  description TEXT
    CHECK (
      description IS NULL
      OR (length(description) BETWEEN 1 AND 5000 AND description = trim(description))
    ),
  technique_notes TEXT
    CHECK (
      technique_notes IS NULL
      OR (length(technique_notes) BETWEEN 1 AND 5000 AND technique_notes = trim(technique_notes))
    ),
  safety_notes TEXT
    CHECK (
      safety_notes IS NULL
      OR (length(safety_notes) BETWEEN 1 AND 5000 AND safety_notes = trim(safety_notes))
    ),
  video_url TEXT
    CHECK (
      video_url IS NULL
      OR (length(video_url) BETWEEN 1 AND 2048 AND video_url = trim(video_url))
    ),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0 AND updated_at = trim(updated_at))
);

CREATE INDEX exercises_name_idx
ON exercises (name COLLATE NOCASE, name, id);

CREATE INDEX exercises_active_name_idx
ON exercises (is_active, name COLLATE NOCASE, name, id);

CREATE TRIGGER exercises_slug_immutable
BEFORE UPDATE OF slug ON exercises
WHEN NEW.slug IS NOT OLD.slug
BEGIN
  SELECT RAISE(ABORT, 'exercise slug is immutable');
END;
