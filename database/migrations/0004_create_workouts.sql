CREATE UNIQUE INDEX routines_id_user_unique
ON routines (id, user_id);

CREATE UNIQUE INDEX routine_versions_id_routine_sealed_unique
ON routine_versions (id, routine_id, is_sealed);

CREATE UNIQUE INDEX routine_exercises_id_version_unique
ON routine_exercises (id, routine_version_id);

CREATE TABLE workout_sessions (
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
  routine_id ANY NOT NULL
    CHECK (
      typeof(routine_id) IN ('integer', 'real')
      AND routine_id = CAST(routine_id AS INTEGER)
      AND routine_id BETWEEN 1 AND 9007199254740991
    ),
  routine_version_id ANY NOT NULL
    CHECK (
      typeof(routine_version_id) IN ('integer', 'real')
      AND routine_version_id = CAST(routine_version_id AS INTEGER)
      AND routine_version_id BETWEEN 1 AND 9007199254740991
    ),
  routine_version_is_sealed ANY NOT NULL DEFAULT 1
    CHECK (
      typeof(routine_version_is_sealed) IN ('integer', 'real')
      AND routine_version_is_sealed = CAST(routine_version_is_sealed AS INTEGER)
      AND routine_version_is_sealed = 1
    ),
  started_at TEXT NOT NULL
    CHECK (
      started_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) = started_at
    ),
  completed_at TEXT
    CHECK (
      completed_at IS NULL
      OR (
        completed_at GLOB
          '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
        AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at
        AND completed_at >= started_at
      )
    ),
  duration_seconds ANY GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NULL THEN NULL
      ELSE CAST(
        ROUND((julianday(completed_at) - julianday(started_at)) * 86400.0)
        AS INTEGER
      )
    END
  ) STORED,
  status TEXT NOT NULL
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  overall_rpe ANY,
  overall_rpe_is_set ANY NOT NULL DEFAULT 0
    CHECK (
      typeof(overall_rpe_is_set) IN ('integer', 'real')
      AND overall_rpe_is_set = CAST(overall_rpe_is_set AS INTEGER)
      AND overall_rpe_is_set IN (0, 1)
    ),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  created_at TEXT NOT NULL
    CHECK (
      created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
    ),
  FOREIGN KEY (routine_id, user_id) REFERENCES routines (id, user_id),
  FOREIGN KEY (routine_version_id, routine_id, routine_version_is_sealed)
    REFERENCES routine_versions (id, routine_id, is_sealed),
  UNIQUE (id, routine_version_id),
  CHECK (
    (overall_rpe_is_set = 0 AND overall_rpe IS NULL)
    OR (
      overall_rpe_is_set = 1
      AND typeof(overall_rpe) IN ('integer', 'real')
      AND overall_rpe BETWEEN 1 AND 10
      AND abs(overall_rpe) <= 1.7976931348623157e308
    )
  ),
  CHECK (
    (duration_seconds IS NULL)
    OR (
      typeof(duration_seconds) = 'integer'
      AND duration_seconds BETWEEN 0 AND 9007199254740991
    )
  ),
  CHECK (
    (
      status = 'in_progress'
      AND completed_at IS NULL
      AND duration_seconds IS NULL
      AND overall_rpe IS NULL
      AND overall_rpe_is_set = 0
      AND notes IS NULL
    )
    OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND duration_seconds IS NOT NULL
    )
    OR (
      status = 'cancelled'
      AND completed_at IS NULL
      AND duration_seconds IS NULL
      AND overall_rpe IS NULL
      AND overall_rpe_is_set = 0
      AND notes IS NULL
    )
  )
) STRICT;

CREATE TABLE workout_exercises (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  workout_session_id ANY NOT NULL
    CHECK (
      typeof(workout_session_id) IN ('integer', 'real')
      AND workout_session_id = CAST(workout_session_id AS INTEGER)
      AND workout_session_id BETWEEN 1 AND 9007199254740991
    ),
  routine_version_id ANY NOT NULL
    CHECK (
      typeof(routine_version_id) IN ('integer', 'real')
      AND routine_version_id = CAST(routine_version_id AS INTEGER)
      AND routine_version_id BETWEEN 1 AND 9007199254740991
    ),
  routine_exercise_id ANY NOT NULL
    CHECK (
      typeof(routine_exercise_id) IN ('integer', 'real')
      AND routine_exercise_id = CAST(routine_exercise_id AS INTEGER)
      AND routine_exercise_id BETWEEN 1 AND 9007199254740991
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
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  FOREIGN KEY (workout_session_id, routine_version_id)
    REFERENCES workout_sessions (id, routine_version_id),
  FOREIGN KEY (routine_exercise_id, routine_version_id)
    REFERENCES routine_exercises (id, routine_version_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises (id),
  UNIQUE (workout_session_id, routine_exercise_id),
  UNIQUE (workout_session_id, position)
) STRICT;

CREATE TABLE workout_sets (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  workout_exercise_id ANY NOT NULL
    CHECK (
      typeof(workout_exercise_id) IN ('integer', 'real')
      AND workout_exercise_id = CAST(workout_exercise_id AS INTEGER)
      AND workout_exercise_id BETWEEN 1 AND 9007199254740991
    ),
  set_number ANY NOT NULL
    CHECK (
      typeof(set_number) IN ('integer', 'real')
      AND set_number = CAST(set_number AS INTEGER)
      AND set_number BETWEEN 1 AND 9007199254740991
    ),
  weight_kg ANY,
  weight_kg_is_set ANY NOT NULL
    CHECK (
      typeof(weight_kg_is_set) IN ('integer', 'real')
      AND weight_kg_is_set = CAST(weight_kg_is_set AS INTEGER)
      AND weight_kg_is_set IN (0, 1)
    ),
  reps ANY,
  reps_is_set ANY NOT NULL
    CHECK (
      typeof(reps_is_set) IN ('integer', 'real')
      AND reps_is_set = CAST(reps_is_set AS INTEGER)
      AND reps_is_set IN (0, 1)
    ),
  duration_seconds ANY,
  duration_seconds_is_set ANY NOT NULL
    CHECK (
      typeof(duration_seconds_is_set) IN ('integer', 'real')
      AND duration_seconds_is_set = CAST(duration_seconds_is_set AS INTEGER)
      AND duration_seconds_is_set IN (0, 1)
    ),
  rpe ANY,
  rpe_is_set ANY NOT NULL
    CHECK (
      typeof(rpe_is_set) IN ('integer', 'real')
      AND rpe_is_set = CAST(rpe_is_set AS INTEGER)
      AND rpe_is_set IN (0, 1)
    ),
  completed ANY NOT NULL
    CHECK (
      typeof(completed) IN ('integer', 'real')
      AND completed = CAST(completed AS INTEGER)
      AND completed IN (0, 1)
    ),
  pain_level ANY,
  pain_level_is_set ANY NOT NULL
    CHECK (
      typeof(pain_level_is_set) IN ('integer', 'real')
      AND pain_level_is_set = CAST(pain_level_is_set AS INTEGER)
      AND pain_level_is_set IN (0, 1)
    ),
  pain_area TEXT
    CHECK (pain_area IS NULL OR (length(pain_area) BETWEEN 1 AND 200 AND pain_area = trim(pain_area))),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id),
  UNIQUE (workout_exercise_id, set_number),
  CHECK (
    (weight_kg_is_set = 0 AND weight_kg IS NULL)
    OR (
      weight_kg_is_set = 1
      AND typeof(weight_kg) IN ('integer', 'real')
      AND weight_kg >= 0
      AND abs(weight_kg) <= 1.7976931348623157e308
    )
  ),
  CHECK (
    (reps_is_set = 0 AND reps IS NULL)
    OR (
      reps_is_set = 1
      AND typeof(reps) IN ('integer', 'real')
      AND reps = CAST(reps AS INTEGER)
      AND reps BETWEEN 0 AND 9007199254740991
    )
  ),
  CHECK (
    (duration_seconds_is_set = 0 AND duration_seconds IS NULL)
    OR (
      duration_seconds_is_set = 1
      AND typeof(duration_seconds) IN ('integer', 'real')
      AND duration_seconds = CAST(duration_seconds AS INTEGER)
      AND duration_seconds BETWEEN 0 AND 9007199254740991
    )
  ),
  CHECK (
    (rpe_is_set = 0 AND rpe IS NULL)
    OR (
      rpe_is_set = 1
      AND typeof(rpe) IN ('integer', 'real')
      AND rpe BETWEEN 1 AND 10
      AND abs(rpe) <= 1.7976931348623157e308
    )
  ),
  CHECK (
    (pain_level_is_set = 0 AND pain_level IS NULL)
    OR (
      pain_level_is_set = 1
      AND typeof(pain_level) IN ('integer', 'real')
      AND pain_level = CAST(pain_level AS INTEGER)
      AND pain_level BETWEEN 0 AND 10
    )
  )
) STRICT;

CREATE INDEX workout_sessions_user_started_idx
ON workout_sessions (user_id, started_at DESC, id DESC);

CREATE INDEX workout_sessions_user_status_started_idx
ON workout_sessions (user_id, status, started_at DESC, id DESC);

CREATE INDEX workout_sessions_version_idx
ON workout_sessions (routine_version_id);

CREATE INDEX workout_exercises_planned_version_idx
ON workout_exercises (routine_exercise_id, routine_version_id);

CREATE TRIGGER workout_sessions_insert_in_progress
BEFORE INSERT ON workout_sessions
WHEN NEW.status <> 'in_progress'
  OR NEW.completed_at IS NOT NULL
  OR NEW.overall_rpe IS NOT NULL
  OR NEW.overall_rpe_is_set <> 0
  OR NEW.notes IS NOT NULL
  OR EXISTS (SELECT 1 FROM workout_sessions WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'workout sessions must be created in progress');
END;

CREATE TRIGGER workout_sessions_terminal_transition
BEFORE UPDATE ON workout_sessions
WHEN OLD.status <> 'in_progress'
  OR NEW.status NOT IN ('completed', 'cancelled')
  OR NEW.id IS NOT OLD.id
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.routine_id IS NOT OLD.routine_id
  OR NEW.routine_version_id IS NOT OLD.routine_version_id
  OR NEW.routine_version_is_sealed IS NOT OLD.routine_version_is_sealed
  OR NEW.started_at IS NOT OLD.started_at
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'invalid workout terminal transition');
END;

CREATE TRIGGER workout_sessions_immutable_delete
BEFORE DELETE ON workout_sessions
BEGIN
  SELECT RAISE(ABORT, 'workout sessions cannot be deleted');
END;

CREATE TRIGGER workout_exercises_insert_guard
BEFORE INSERT ON workout_exercises
WHEN EXISTS (SELECT 1 FROM workout_exercises WHERE id = NEW.id)
  OR EXISTS (
    SELECT 1 FROM workout_exercises
    WHERE workout_session_id = NEW.workout_session_id
      AND routine_exercise_id = NEW.routine_exercise_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE id = NEW.workout_session_id AND status = 'in_progress'
  )
  OR NOT EXISTS (
    SELECT 1 FROM exercises WHERE id = NEW.exercise_id AND is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'workout exercise requires an active in-progress session');
END;

CREATE TRIGGER workout_exercises_position_guard
BEFORE INSERT ON workout_exercises
WHEN EXISTS (
  SELECT 1 FROM workout_exercises
  WHERE workout_session_id = NEW.workout_session_id
    AND position = NEW.position
)
BEGIN
  SELECT RAISE(ABORT, 'workout result position conflict');
END;

CREATE TRIGGER workout_exercises_update_guard
BEFORE UPDATE ON workout_exercises
WHEN NEW.id IS NOT OLD.id
  OR NEW.workout_session_id IS NOT OLD.workout_session_id
  OR NEW.routine_version_id IS NOT OLD.routine_version_id
  OR NEW.routine_exercise_id IS NOT OLD.routine_exercise_id
  OR NOT EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE id = OLD.workout_session_id AND status = 'in_progress'
  )
  OR NOT EXISTS (
    SELECT 1 FROM exercises WHERE id = NEW.exercise_id AND is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'workout exercise is not writable');
END;

CREATE TRIGGER workout_exercises_update_position_guard
BEFORE UPDATE ON workout_exercises
WHEN EXISTS (
  SELECT 1 FROM workout_exercises
  WHERE workout_session_id = NEW.workout_session_id
    AND position = NEW.position
    AND id <> OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'workout result position conflict');
END;

CREATE TRIGGER workout_exercises_immutable_delete
BEFORE DELETE ON workout_exercises
BEGIN
  SELECT RAISE(ABORT, 'workout exercises cannot be deleted');
END;

CREATE TRIGGER workout_sets_insert_guard
BEFORE INSERT ON workout_sets
WHEN EXISTS (SELECT 1 FROM workout_sets WHERE id = NEW.id)
  OR EXISTS (
    SELECT 1 FROM workout_sets
    WHERE workout_exercise_id = NEW.workout_exercise_id
      AND set_number = NEW.set_number
  )
  OR NOT EXISTS (
    SELECT 1
    FROM workout_exercises
    JOIN workout_sessions
      ON workout_sessions.id = workout_exercises.workout_session_id
    JOIN exercises ON exercises.id = workout_exercises.exercise_id
    WHERE workout_exercises.id = NEW.workout_exercise_id
      AND workout_sessions.status = 'in_progress'
      AND exercises.is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'workout set requires an active in-progress result');
END;

CREATE TRIGGER workout_sets_update_guard
BEFORE UPDATE ON workout_sets
WHEN NEW.id IS NOT OLD.id
  OR NEW.workout_exercise_id IS NOT OLD.workout_exercise_id
  OR NEW.set_number IS NOT OLD.set_number
  OR NOT EXISTS (
    SELECT 1
    FROM workout_exercises
    JOIN workout_sessions
      ON workout_sessions.id = workout_exercises.workout_session_id
    JOIN exercises ON exercises.id = workout_exercises.exercise_id
    WHERE workout_exercises.id = OLD.workout_exercise_id
      AND workout_sessions.status = 'in_progress'
      AND exercises.is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'workout set is not writable');
END;

CREATE TRIGGER workout_sets_delete_guard
BEFORE DELETE ON workout_sets
WHEN NOT EXISTS (
  SELECT 1
  FROM workout_exercises
  JOIN workout_sessions
    ON workout_sessions.id = workout_exercises.workout_session_id
  JOIN exercises ON exercises.id = workout_exercises.exercise_id
  WHERE workout_exercises.id = OLD.workout_exercise_id
    AND workout_sessions.status = 'in_progress'
    AND exercises.is_active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'workout set is not writable');
END;
