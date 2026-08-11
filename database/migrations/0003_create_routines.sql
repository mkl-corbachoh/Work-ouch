CREATE TABLE routine_protocol_states (
  state ANY PRIMARY KEY
    CHECK (
      typeof(state) IN ('integer', 'real')
      AND state = CAST(state AS INTEGER)
      AND state = 0
    )
) STRICT;

INSERT INTO routine_protocol_states (state) VALUES (0);

CREATE TRIGGER routine_protocol_states_immutable_update
BEFORE UPDATE ON routine_protocol_states
BEGIN
  SELECT RAISE(ABORT, 'routine protocol state is immutable');
END;

CREATE TRIGGER routine_protocol_states_immutable_delete
BEFORE DELETE ON routine_protocol_states
BEGIN
  SELECT RAISE(ABORT, 'routine protocol state is immutable');
END;

CREATE TABLE routines (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  user_id ANY NOT NULL
    CHECK (
      typeof(user_id) IN ('integer', 'real')
      AND user_id = CAST(user_id AS INTEGER)
      AND user_id BETWEEN 1 AND 9007199254740991
    ),
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 200 AND name = trim(name)),
  description TEXT
    CHECK (
      description IS NULL
      OR (length(description) BETWEEN 1 AND 5000 AND description = trim(description))
    ),
  is_active ANY NOT NULL DEFAULT 1
    CHECK (
      typeof(is_active) IN ('integer', 'real')
      AND is_active = CAST(is_active AS INTEGER)
      AND is_active IN (0, 1)
    ),
  current_version_number ANY NOT NULL
    CHECK (
      typeof(current_version_number) IN ('integer', 'real')
      AND current_version_number = CAST(current_version_number AS INTEGER)
      AND current_version_number BETWEEN 1 AND 9007199254740991
    ),
  current_version_is_sealed ANY NOT NULL DEFAULT 1
    CHECK (
      typeof(current_version_is_sealed) IN ('integer', 'real')
      AND current_version_is_sealed = CAST(current_version_is_sealed AS INTEGER)
      AND current_version_is_sealed = 1
    ),
  pending_version_number ANY DEFAULT 1
    CHECK (
      pending_version_number IS NULL
      OR (
        typeof(pending_version_number) IN ('integer', 'real')
        AND pending_version_number = CAST(pending_version_number AS INTEGER)
        AND pending_version_number BETWEEN 1 AND 9007199254740991
      )
    ),
  protocol_state ANY NOT NULL DEFAULT 1
    CHECK (
      typeof(protocol_state) IN ('integer', 'real')
      AND protocol_state = CAST(protocol_state AS INTEGER)
      AND protocol_state IN (0, 1)
    ),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) > 0 AND updated_at = trim(updated_at)),
  CHECK (
    (protocol_state = 0 AND pending_version_number IS NULL)
    OR (protocol_state = 1 AND pending_version_number IS NOT NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (protocol_state) REFERENCES routine_protocol_states (state)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (id, current_version_number, current_version_is_sealed)
    REFERENCES routine_versions (routine_id, version_number, is_sealed)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (id, pending_version_number)
    REFERENCES routine_versions (routine_id, version_number)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE routine_versions (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  routine_id ANY NOT NULL
    CHECK (
      typeof(routine_id) IN ('integer', 'real')
      AND routine_id = CAST(routine_id AS INTEGER)
      AND routine_id BETWEEN 1 AND 9007199254740991
    ),
  version_number ANY NOT NULL
    CHECK (
      typeof(version_number) IN ('integer', 'real')
      AND version_number = CAST(version_number AS INTEGER)
      AND version_number BETWEEN 1 AND 9007199254740991
    ),
  name TEXT
    CHECK (name IS NULL OR (length(name) BETWEEN 1 AND 200 AND name = trim(name))),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  is_sealed ANY NOT NULL DEFAULT 0
    CHECK (
      typeof(is_sealed) IN ('integer', 'real')
      AND is_sealed = CAST(is_sealed AS INTEGER)
      AND is_sealed IN (0, 1)
    ),
  created_at TEXT NOT NULL
    CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  FOREIGN KEY (routine_id) REFERENCES routines (id),
  UNIQUE (routine_id, version_number),
  UNIQUE (routine_id, version_number, is_sealed)
) STRICT;

CREATE TABLE routine_exercises (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  routine_version_id ANY NOT NULL
    CHECK (
      typeof(routine_version_id) IN ('integer', 'real')
      AND routine_version_id = CAST(routine_version_id AS INTEGER)
      AND routine_version_id BETWEEN 1 AND 9007199254740991
    ),
  exercise_id ANY NOT NULL
    CHECK (
      typeof(exercise_id) IN ('integer', 'real')
      AND exercise_id = CAST(exercise_id AS INTEGER)
      AND exercise_id BETWEEN 1 AND 9007199254740991
    ),
  position ANY NOT NULL
    CHECK (
      typeof(position) IN ('integer', 'real')
      AND position = CAST(position AS INTEGER)
      AND position BETWEEN 1 AND 9007199254740991
    ),
  rest_seconds ANY,
  rest_seconds_is_set ANY NOT NULL
    CHECK (
      typeof(rest_seconds_is_set) IN ('integer', 'real')
      AND rest_seconds_is_set = CAST(rest_seconds_is_set AS INTEGER)
      AND rest_seconds_is_set IN (0, 1)
    ),
  target_rpe ANY,
  target_rpe_is_set ANY NOT NULL
    CHECK (
      typeof(target_rpe_is_set) IN ('integer', 'real')
      AND target_rpe_is_set = CAST(target_rpe_is_set AS INTEGER)
      AND target_rpe_is_set IN (0, 1)
    ),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  FOREIGN KEY (routine_version_id) REFERENCES routine_versions (id),
  FOREIGN KEY (exercise_id) REFERENCES exercises (id),
  UNIQUE (routine_version_id, position),
  CHECK (
    (rest_seconds_is_set = 0 AND rest_seconds IS NULL)
    OR (
      rest_seconds_is_set = 1
      AND typeof(rest_seconds) IN ('integer', 'real')
      AND rest_seconds = CAST(rest_seconds AS INTEGER)
      AND rest_seconds BETWEEN 0 AND 9007199254740991
    )
  ),
  CHECK (
    (target_rpe_is_set = 0 AND target_rpe IS NULL)
    OR (
      target_rpe_is_set = 1
      AND typeof(target_rpe) IN ('integer', 'real')
      AND target_rpe BETWEEN 1 AND 10
      AND abs(target_rpe) <= 1.7976931348623157e308
    )
  )
) STRICT;

CREATE TABLE routine_sets (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  routine_exercise_id ANY NOT NULL
    CHECK (
      typeof(routine_exercise_id) IN ('integer', 'real')
      AND routine_exercise_id = CAST(routine_exercise_id AS INTEGER)
      AND routine_exercise_id BETWEEN 1 AND 9007199254740991
    ),
  set_number ANY NOT NULL
    CHECK (
      typeof(set_number) IN ('integer', 'real')
      AND set_number = CAST(set_number AS INTEGER)
      AND set_number BETWEEN 1 AND 9007199254740991
    ),
  set_type TEXT CHECK (set_type IS NULL OR set_type IN ('warmup', 'work', 'backoff')),
  target_weight_kg ANY,
  target_weight_kg_is_set ANY NOT NULL
    CHECK (
      typeof(target_weight_kg_is_set) IN ('integer', 'real')
      AND target_weight_kg_is_set = CAST(target_weight_kg_is_set AS INTEGER)
      AND target_weight_kg_is_set IN (0, 1)
    ),
  target_reps_min ANY,
  target_reps_min_is_set ANY NOT NULL
    CHECK (
      typeof(target_reps_min_is_set) IN ('integer', 'real')
      AND target_reps_min_is_set = CAST(target_reps_min_is_set AS INTEGER)
      AND target_reps_min_is_set IN (0, 1)
    ),
  target_reps_max ANY,
  target_reps_max_is_set ANY NOT NULL
    CHECK (
      typeof(target_reps_max_is_set) IN ('integer', 'real')
      AND target_reps_max_is_set = CAST(target_reps_max_is_set AS INTEGER)
      AND target_reps_max_is_set IN (0, 1)
    ),
  target_seconds ANY,
  target_seconds_is_set ANY NOT NULL
    CHECK (
      typeof(target_seconds_is_set) IN ('integer', 'real')
      AND target_seconds_is_set = CAST(target_seconds_is_set AS INTEGER)
      AND target_seconds_is_set IN (0, 1)
    ),
  target_rpe ANY,
  target_rpe_is_set ANY NOT NULL
    CHECK (
      typeof(target_rpe_is_set) IN ('integer', 'real')
      AND target_rpe_is_set = CAST(target_rpe_is_set AS INTEGER)
      AND target_rpe_is_set IN (0, 1)
    ),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  FOREIGN KEY (routine_exercise_id) REFERENCES routine_exercises (id),
  UNIQUE (routine_exercise_id, set_number),
  CHECK (
    (target_weight_kg_is_set = 0 AND target_weight_kg IS NULL)
    OR (
      target_weight_kg_is_set = 1
      AND typeof(target_weight_kg) IN ('integer', 'real')
      AND target_weight_kg >= 0
      AND abs(target_weight_kg) <= 1.7976931348623157e308
    )
  ),
  CHECK (
    (target_rpe_is_set = 0 AND target_rpe IS NULL)
    OR (
      target_rpe_is_set = 1
      AND typeof(target_rpe) IN ('integer', 'real')
      AND target_rpe BETWEEN 1 AND 10
      AND abs(target_rpe) <= 1.7976931348623157e308
    )
  ),
  CHECK (
    (target_reps_min_is_set = 0 AND target_reps_min IS NULL)
    OR (
      target_reps_min_is_set = 1
      AND typeof(target_reps_min) IN ('integer', 'real')
      AND target_reps_min = CAST(target_reps_min AS INTEGER)
      AND target_reps_min BETWEEN 1 AND 9007199254740991
    )
  ),
  CHECK (
    (target_reps_max_is_set = 0 AND target_reps_max IS NULL)
    OR (
      target_reps_max_is_set = 1
      AND typeof(target_reps_max) IN ('integer', 'real')
      AND target_reps_max = CAST(target_reps_max AS INTEGER)
      AND target_reps_max BETWEEN 1 AND 9007199254740991
    )
  ),
  CHECK (
    (target_seconds_is_set = 0 AND target_seconds IS NULL)
    OR (
      target_seconds_is_set = 1
      AND typeof(target_seconds) IN ('integer', 'real')
      AND target_seconds = CAST(target_seconds AS INTEGER)
      AND target_seconds BETWEEN 0 AND 9007199254740991
    )
  ),
  CHECK (
    (target_reps_min IS NULL AND target_reps_max IS NULL)
    OR (
      target_reps_min IS NOT NULL
      AND target_reps_max IS NOT NULL
      AND target_reps_min <= target_reps_max
    )
  ),
  CHECK (target_reps_min IS NOT NULL OR target_seconds IS NOT NULL)
) STRICT;

CREATE INDEX routines_user_name_idx
ON routines (user_id, name COLLATE NOCASE, name, id);

CREATE INDEX routine_versions_routine_number_idx
ON routine_versions (routine_id, version_number);

CREATE INDEX routine_exercises_version_position_idx
ON routine_exercises (routine_version_id, position);

CREATE INDEX routine_exercises_exercise_idx
ON routine_exercises (exercise_id);

CREATE INDEX routine_sets_exercise_number_idx
ON routine_sets (routine_exercise_id, set_number);

CREATE TRIGGER routines_initial_protocol
BEFORE INSERT ON routines
WHEN NEW.current_version_number <> 1
  OR NEW.pending_version_number IS NOT 1
  OR NEW.protocol_state <> 1
BEGIN
  SELECT RAISE(ABORT, 'a routine must start with pending version 1');
END;

CREATE TRIGGER routines_protocol_transition
BEFORE UPDATE OF current_version_number, pending_version_number, protocol_state ON routines
WHEN NOT (
  (
    OLD.protocol_state = 0
    AND OLD.pending_version_number IS NULL
    AND NEW.protocol_state = 1
    AND NEW.pending_version_number = OLD.current_version_number + 1
    AND NEW.current_version_number = OLD.current_version_number
    AND EXISTS (
      SELECT 1
      FROM routine_versions
      WHERE routine_id = OLD.id
        AND version_number = NEW.pending_version_number
        AND is_sealed = 0
    )
  )
  OR (
    OLD.protocol_state = 1
    AND OLD.pending_version_number = 1
    AND OLD.current_version_number = 1
    AND NEW.protocol_state = 0
    AND NEW.pending_version_number IS NULL
    AND NEW.current_version_number = 1
    AND EXISTS (
      SELECT 1
      FROM routine_versions
      WHERE routine_id = OLD.id
        AND version_number = 1
        AND is_sealed = 1
    )
  )
  OR (
    OLD.protocol_state = 1
    AND OLD.pending_version_number = OLD.current_version_number + 1
    AND NEW.protocol_state = 0
    AND NEW.pending_version_number IS NULL
    AND NEW.current_version_number = OLD.current_version_number + 1
    AND EXISTS (
      SELECT 1
      FROM routine_versions
      WHERE routine_id = OLD.id
        AND version_number = NEW.current_version_number
        AND is_sealed = 1
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid routine version protocol transition');
END;

CREATE TRIGGER routine_versions_valid_sequence
BEFORE INSERT ON routine_versions
WHEN NOT EXISTS (
  SELECT 1
  FROM routines
  WHERE routines.id = NEW.routine_id
    AND (
      (
        NEW.version_number = 1
        AND routines.current_version_number = 1
        AND routines.pending_version_number = 1
        AND routines.protocol_state = 1
        AND NOT EXISTS (
          SELECT 1 FROM routine_versions WHERE routine_id = routines.id
        )
      )
      OR (
        NEW.version_number = routines.current_version_number + 1
        AND routines.pending_version_number IS NULL
        AND routines.protocol_state = 0
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'routine version must be the next pending version');
END;

CREATE TRIGGER routine_versions_begin_protocol
AFTER INSERT ON routine_versions
WHEN NEW.version_number > (
  SELECT current_version_number FROM routines WHERE id = NEW.routine_id
)
BEGIN
  UPDATE routines
  SET pending_version_number = NEW.version_number, protocol_state = 1
  WHERE id = NEW.routine_id;
END;

CREATE TRIGGER routine_versions_created_unsealed
BEFORE INSERT ON routine_versions
WHEN NEW.is_sealed <> 0
BEGIN
  SELECT RAISE(ABORT, 'routine versions must be created unsealed');
END;

CREATE TRIGGER routine_versions_seal_complete
BEFORE UPDATE OF is_sealed ON routine_versions
WHEN OLD.is_sealed = 0 AND NEW.is_sealed = 1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM routine_exercises WHERE routine_version_id = OLD.id
  ) THEN RAISE(ABORT, 'a sealed routine version requires an exercise') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM routine_exercises AS routine_exercise
    WHERE routine_exercise.routine_version_id = OLD.id
      AND NOT EXISTS (
        SELECT 1
        FROM routine_sets
        WHERE routine_exercise_id = routine_exercise.id
      )
  ) THEN RAISE(ABORT, 'every routine exercise requires a set') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM routine_exercises
    JOIN exercises ON exercises.id = routine_exercises.exercise_id
    WHERE routine_exercises.routine_version_id = OLD.id
      AND exercises.is_active <> 1
  ) THEN RAISE(ABORT, 'a sealed routine version requires active exercises') END;
END;

CREATE TRIGGER routine_versions_immutable_update
BEFORE UPDATE ON routine_versions
WHEN OLD.is_sealed = 1
  OR NEW.is_sealed <> 1
  OR NEW.id IS NOT OLD.id
  OR NEW.routine_id IS NOT OLD.routine_id
  OR NEW.version_number IS NOT OLD.version_number
  OR NEW.name IS NOT OLD.name
  OR NEW.notes IS NOT OLD.notes
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'routine version is immutable');
END;

CREATE TRIGGER routine_versions_immutable_delete
BEFORE DELETE ON routine_versions
WHEN OLD.is_sealed = 1
BEGIN
  SELECT RAISE(ABORT, 'sealed routine version cannot be deleted');
END;

CREATE TRIGGER routine_exercises_require_active_exercise
BEFORE INSERT ON routine_exercises
WHEN NOT EXISTS (
  SELECT 1 FROM exercises WHERE id = NEW.exercise_id AND is_active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'routine exercise must reference an active exercise');
END;

CREATE TRIGGER routine_exercises_reject_sealed_insert
BEFORE INSERT ON routine_exercises
WHEN EXISTS (
  SELECT 1
  FROM routine_versions
  WHERE id = NEW.routine_version_id AND is_sealed = 1
)
BEGIN
  SELECT RAISE(ABORT, 'sealed routine version cannot accept exercises');
END;

CREATE TRIGGER routine_exercises_immutable_update
BEFORE UPDATE ON routine_exercises
BEGIN
  SELECT RAISE(ABORT, 'routine exercise is immutable');
END;

CREATE TRIGGER routine_exercises_immutable_delete
BEFORE DELETE ON routine_exercises
BEGIN
  SELECT RAISE(ABORT, 'routine exercise is immutable');
END;

CREATE TRIGGER routine_sets_reject_sealed_insert
BEFORE INSERT ON routine_sets
WHEN EXISTS (
  SELECT 1
  FROM routine_exercises
  JOIN routine_versions
    ON routine_versions.id = routine_exercises.routine_version_id
  WHERE routine_exercises.id = NEW.routine_exercise_id
    AND routine_versions.is_sealed = 1
)
BEGIN
  SELECT RAISE(ABORT, 'sealed routine version cannot accept sets');
END;

CREATE TRIGGER routine_sets_immutable_update
BEFORE UPDATE ON routine_sets
BEGIN
  SELECT RAISE(ABORT, 'routine set is immutable');
END;

CREATE TRIGGER routine_sets_immutable_delete
BEFORE DELETE ON routine_sets
BEGIN
  SELECT RAISE(ABORT, 'routine set is immutable');
END;
