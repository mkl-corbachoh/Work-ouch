CREATE TABLE body_metric_types (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  code TEXT NOT NULL COLLATE BINARY UNIQUE
    CHECK (
      length(code) BETWEEN 1 AND 100
      AND instr(code, char(0)) = 0
      AND code = trim(code)
      AND code = lower(code)
      AND code NOT GLOB '*[^a-z0-9_]*'
      AND code NOT GLOB '_*'
      AND code NOT GLOB '*_'
      AND code NOT GLOB '*__*'
    ),
  name TEXT NOT NULL
    CHECK (length(name) BETWEEN 1 AND 200 AND name = trim(name)),
  unit TEXT
    CHECK (unit IS NULL OR (length(unit) BETWEEN 1 AND 100 AND unit = trim(unit))),
  description TEXT
    CHECK (
      description IS NULL
      OR (length(description) BETWEEN 1 AND 5000 AND description = trim(description))
    )
) STRICT;

CREATE TABLE body_measurements (
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
  measured_at TEXT NOT NULL
    CHECK (
      measured_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', measured_at) = measured_at
    ),
  source TEXT
    CHECK (source IS NULL OR (length(source) BETWEEN 1 AND 200 AND source = trim(source))),
  notes TEXT
    CHECK (notes IS NULL OR (length(notes) BETWEEN 1 AND 5000 AND notes = trim(notes))),
  created_at TEXT NOT NULL
    CHECK (
      created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
    ),
  FOREIGN KEY (user_id) REFERENCES users (id)
) STRICT;

CREATE TABLE body_measurement_values (
  id ANY PRIMARY KEY
    CHECK (
      typeof(id) IN ('integer', 'real')
      AND id = CAST(id AS INTEGER)
      AND id BETWEEN 1 AND 9007199254740991
    ),
  measurement_id ANY NOT NULL
    CHECK (
      typeof(measurement_id) IN ('integer', 'real')
      AND measurement_id = CAST(measurement_id AS INTEGER)
      AND measurement_id BETWEEN 1 AND 9007199254740991
    ),
  metric_type_id ANY NOT NULL
    CHECK (
      typeof(metric_type_id) IN ('integer', 'real')
      AND metric_type_id = CAST(metric_type_id AS INTEGER)
      AND metric_type_id BETWEEN 1 AND 9007199254740991
    ),
  value ANY NOT NULL
    CHECK (
      typeof(value) = 'integer'
      OR (
        typeof(value) = 'real'
        AND value >= -1.7976931348623157e308
        AND value <= 1.7976931348623157e308
      )
    ),
  FOREIGN KEY (measurement_id) REFERENCES body_measurements (id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (metric_type_id) REFERENCES body_metric_types (id),
  UNIQUE (measurement_id, metric_type_id)
) STRICT;

CREATE INDEX body_measurements_user_measured_idx
ON body_measurements (user_id, measured_at DESC, id DESC);

CREATE INDEX body_measurement_values_type_measurement_idx
ON body_measurement_values (metric_type_id, measurement_id);

CREATE TRIGGER body_metric_types_insert_guard
BEFORE INSERT ON body_metric_types
WHEN EXISTS (SELECT 1 FROM body_metric_types WHERE id = NEW.id)
  OR EXISTS (SELECT 1 FROM body_metric_types WHERE code = NEW.code)
BEGIN
  SELECT RAISE(ABORT, 'body metric type already exists');
END;

CREATE TRIGGER body_metric_types_identity_immutable
BEFORE UPDATE ON body_metric_types
WHEN NEW.id IS NOT OLD.id OR NEW.code IS NOT OLD.code
BEGIN
  SELECT RAISE(ABORT, 'body metric type identity is immutable');
END;

CREATE TRIGGER body_metric_types_immutable_delete
BEFORE DELETE ON body_metric_types
BEGIN
  SELECT RAISE(ABORT, 'body metric types cannot be deleted');
END;

CREATE TRIGGER body_measurements_insert_guard
BEFORE INSERT ON body_measurements
WHEN EXISTS (SELECT 1 FROM body_measurements WHERE id = NEW.id)
  OR NOT EXISTS (
    SELECT 1 FROM body_measurement_values WHERE measurement_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'body measurement requires values first');
END;

CREATE TRIGGER body_measurements_immutable_update
BEFORE UPDATE ON body_measurements
BEGIN
  SELECT RAISE(ABORT, 'body measurements are immutable');
END;

CREATE TRIGGER body_measurements_immutable_delete
BEFORE DELETE ON body_measurements
BEGIN
  SELECT RAISE(ABORT, 'body measurements cannot be deleted');
END;

CREATE TRIGGER body_measurement_values_insert_guard
BEFORE INSERT ON body_measurement_values
WHEN EXISTS (
    SELECT 1 FROM body_measurements WHERE id = NEW.measurement_id
  )
  OR EXISTS (SELECT 1 FROM body_measurement_values WHERE id = NEW.id)
  OR EXISTS (
    SELECT 1
    FROM body_measurement_values
    WHERE measurement_id = NEW.measurement_id
      AND metric_type_id = NEW.metric_type_id
  )
BEGIN
  SELECT RAISE(ABORT, 'body measurement values can only be inserted before their measurement');
END;

CREATE TRIGGER body_measurement_values_immutable_update
BEFORE UPDATE ON body_measurement_values
BEGIN
  SELECT RAISE(ABORT, 'body measurement values are immutable');
END;

CREATE TRIGGER body_measurement_values_immutable_delete
BEFORE DELETE ON body_measurement_values
BEGIN
  SELECT RAISE(ABORT, 'body measurement values cannot be deleted');
END;
