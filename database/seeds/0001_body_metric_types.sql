WITH seed_types (code, name, unit, description) AS (
  VALUES
    ('weight_kg', 'Weight', 'kg', NULL),
    ('bmi', 'Body mass index', NULL, NULL),
    ('body_fat_pct', 'Body fat', '%', NULL),
    ('muscle_mass_kg', 'Muscle mass', 'kg', NULL),
    ('water_pct', 'Body water', '%', NULL),
    ('visceral_fat', 'Visceral fat', NULL, NULL),
    ('bone_mass_kg', 'Bone mass', 'kg', NULL),
    ('basal_metabolism_kcal', 'Basal metabolism', 'kcal/day', NULL),
    ('metabolic_age', 'Metabolic age', 'years', NULL)
),
missing_types AS (
  SELECT seed_types.*
  FROM seed_types
  WHERE NOT EXISTS (
    SELECT 1 FROM body_metric_types WHERE code = seed_types.code
  )
),
allocated_types AS (
  SELECT
    code,
    name,
    unit,
    description,
    ROW_NUMBER() OVER (ORDER BY code) AS id_offset
  FROM missing_types
),
current_id AS (
  SELECT COALESCE(MAX(id), 0) AS maximum_id FROM body_metric_types
)
INSERT INTO body_metric_types (id, code, name, unit, description)
SELECT
  CASE
    WHEN maximum_id <= 9007199254740991 - id_offset
    THEN maximum_id + id_offset
    ELSE NULL
  END,
  code,
  name,
  unit,
  description
FROM allocated_types
CROSS JOIN current_id;
