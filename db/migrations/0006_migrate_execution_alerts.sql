-- Migrate workouts.execution from the legacy v1 cue-based shape to the v2
-- alert-based shape used by the Apple Watch export.
--
-- This migration intentionally drops legacy fields that are no longer part of
-- the execution DSL (`summary`, `notes`, unsupported appleWatch flags, etc.).
-- However, it refuses to guess when a legacy payload is ambiguous or not
-- representable losslessly, for example:
--   * multiple cue families on one step
--   * heart-rate objects that mix zone + range or only provide one bound
--   * power cues that rely on ftpPercent* fields
--   * note / strength blocks
--   * lap-button targets

CREATE OR REPLACE FUNCTION pg_temp.alert_family_count(cue jsonb) RETURNS integer AS $$
DECLARE
  total integer := 0;
BEGIN
  IF cue ? 'pace' THEN total := total + 1; END IF;
  IF cue ? 'heartRate' THEN total := total + 1; END IF;
  IF cue ? 'power' THEN total := total + 1; END IF;
  IF cue ? 'cadence' THEN total := total + 1; END IF;
  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.invalid_execution_path(node jsonb, path text DEFAULT '$') RETURNS text AS $$
DECLARE
  key text;
  value jsonb;
  item jsonb;
  idx integer := 0;
  child_path text;
  cue jsonb;
  heart_rate jsonb;
  pace jsonb;
  power jsonb;
  cadence jsonb;
BEGIN
  IF node IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(node) = 'object' THEN
    IF node ? 'type' AND node->>'type' IN ('note', 'strength') THEN
      RETURN path;
    END IF;

    IF node ? 'target' AND jsonb_typeof(node->'target') = 'object' AND node->'target'->>'type' = 'lap-button' THEN
      RETURN path || '.target';
    END IF;

    IF node ? 'cue' THEN
      cue := node->'cue';
      IF cue IS NOT NULL AND jsonb_typeof(cue) <> 'object' THEN
        RETURN path || '.cue';
      END IF;

      IF cue IS NOT NULL AND jsonb_typeof(cue) = 'object' THEN
        IF pg_temp.alert_family_count(cue) > 1 THEN
          RETURN path || '.cue';
        END IF;

        IF cue ? 'heartRate' THEN
          heart_rate := cue->'heartRate';
          IF heart_rate IS NULL OR jsonb_typeof(heart_rate) <> 'object' THEN
            RETURN path || '.cue.heartRate';
          END IF;
          IF (heart_rate ? 'zone') AND ((heart_rate ? 'min') OR (heart_rate ? 'max')) THEN
            RETURN path || '.cue.heartRate';
          END IF;
          IF NOT (heart_rate ? 'zone') AND NOT ((heart_rate ? 'min') AND (heart_rate ? 'max')) THEN
            RETURN path || '.cue.heartRate';
          END IF;
        ELSIF cue ? 'pace' THEN
          pace := cue->'pace';
          IF pace IS NULL OR jsonb_typeof(pace) <> 'object' THEN
            RETURN path || '.cue.pace';
          END IF;
          IF NOT ((pace ? 'min') OR (pace ? 'max')) THEN
            RETURN path || '.cue.pace';
          END IF;
          IF pace->>'unit' IN ('min/km', 'min/mi') THEN
            IF (pace ? 'min' AND jsonb_typeof(pace->'min') <> 'string') OR (pace ? 'max' AND jsonb_typeof(pace->'max') <> 'string') THEN
              RETURN path || '.cue.pace';
            END IF;
          ELSIF pace->>'unit' IN ('km/h', 'mph', 'speed-kmh', 'speed-mph') THEN
            IF (pace ? 'min' AND jsonb_typeof(pace->'min') <> 'number') OR (pace ? 'max' AND jsonb_typeof(pace->'max') <> 'number') THEN
              RETURN path || '.cue.pace';
            END IF;
          ELSE
            RETURN path || '.cue.pace.unit';
          END IF;
        ELSIF cue ? 'power' THEN
          power := cue->'power';
          IF power IS NULL OR jsonb_typeof(power) <> 'object' THEN
            RETURN path || '.cue.power';
          END IF;
          IF (power ? 'ftpPercentMin') OR (power ? 'ftpPercentMax') THEN
            RETURN path || '.cue.power';
          END IF;
          IF NOT ((power ? 'min') OR (power ? 'max')) THEN
            RETURN path || '.cue.power';
          END IF;
        ELSIF cue ? 'cadence' THEN
          cadence := cue->'cadence';
          IF cadence IS NULL OR jsonb_typeof(cadence) <> 'object' THEN
            RETURN path || '.cue.cadence';
          END IF;
          IF NOT ((cadence ? 'min') OR (cadence ? 'max')) THEN
            RETURN path || '.cue.cadence';
          END IF;
        END IF;
      END IF;
    END IF;

    FOR key, value IN SELECT * FROM jsonb_each(node) LOOP
      child_path := pg_temp.invalid_execution_path(value, path || '.' || key);
      IF child_path IS NOT NULL THEN
        RETURN child_path;
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  IF jsonb_typeof(node) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(node) LOOP
      child_path := pg_temp.invalid_execution_path(item, path || '[' || idx || ']');
      IF child_path IS NOT NULL THEN
        RETURN child_path;
      END IF;
      idx := idx + 1;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.cue_to_alert(cue jsonb) RETURNS jsonb AS $$
DECLARE
  pace jsonb;
  heart_rate jsonb;
  power jsonb;
  cadence jsonb;
BEGIN
  IF cue IS NULL OR jsonb_typeof(cue) <> 'object' THEN
    RETURN NULL;
  END IF;

  IF cue ? 'heartRate' THEN
    heart_rate := cue->'heartRate';
    IF heart_rate ? 'zone' THEN
      RETURN jsonb_build_object(
        'type', 'heartRateZone',
        'zone', (heart_rate->>'zone')::integer
      );
    END IF;
    RETURN jsonb_build_object(
      'type', 'heartRateRange',
      'min', (heart_rate->>'min')::integer,
      'max', (heart_rate->>'max')::integer
    );
  END IF;

  IF cue ? 'pace' THEN
    pace := cue->'pace';
    IF pace ? 'min' AND pace ? 'max' THEN
      RETURN jsonb_build_object(
        'type', 'paceRange',
        'unit', pace->>'unit',
        'min', pace->'min',
        'max', pace->'max'
      );
    END IF;
    RETURN jsonb_build_object(
      'type', 'paceThreshold',
      'unit', pace->>'unit',
      'threshold', COALESCE(pace->'min', pace->'max')
    );
  END IF;

  IF cue ? 'power' THEN
    power := cue->'power';
    IF power ? 'min' AND power ? 'max' THEN
      RETURN jsonb_build_object(
        'type', 'powerRange',
        'min', (power->>'min')::numeric,
        'max', (power->>'max')::numeric
      );
    END IF;
    RETURN jsonb_build_object(
      'type', 'powerThreshold',
      'threshold', COALESCE((power->>'min')::numeric, (power->>'max')::numeric)
    );
  END IF;

  IF cue ? 'cadence' THEN
    cadence := cue->'cadence';
    IF cadence ? 'min' AND cadence ? 'max' THEN
      RETURN jsonb_build_object(
        'type', 'cadenceRange',
        'min', (cadence->>'min')::numeric,
        'max', (cadence->>'max')::numeric
      );
    END IF;
    RETURN jsonb_build_object(
      'type', 'cadenceThreshold',
      'threshold', COALESCE((cadence->>'min')::numeric, (cadence->>'max')::numeric)
    );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.migrate_execution_node(node jsonb, is_root boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
  key text;
  value jsonb;
  result jsonb := '{}'::jsonb;
  array_result jsonb := '[]'::jsonb;
  item jsonb;
  alert jsonb;
BEGIN
  IF node IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(node) = 'object' THEN
    FOR key, value IN SELECT * FROM jsonb_each(node) LOOP
      IF key IN ('version', 'summary', 'notes', 'cue', 'title', 'poolLengthMeters', 'alerts', 'displayHints') THEN
        CONTINUE;
      END IF;
      result := result || jsonb_build_object(key, pg_temp.migrate_execution_node(value));
    END LOOP;

    IF node ? 'title' THEN
      result := result || jsonb_build_object('displayName', node->'title');
    END IF;

    IF node ? 'cue' THEN
      alert := pg_temp.cue_to_alert(node->'cue');
      IF alert IS NOT NULL THEN
        result := result || jsonb_build_object('alert', alert);
      END IF;
    END IF;

    IF is_root THEN
      result := result || jsonb_build_object('version', 2);
    END IF;

    RETURN result;
  END IF;

  IF jsonb_typeof(node) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(node) LOOP
      array_result := array_result || jsonb_build_array(pg_temp.migrate_execution_node(item));
    END LOOP;
    RETURN array_result;
  END IF;

  RETURN node;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DO $$
DECLARE
  invalid_row record;
BEGIN
  WITH invalid AS (
    SELECT id, pg_temp.invalid_execution_path(execution) AS path
    FROM workouts
    WHERE execution IS NOT NULL
  )
  SELECT id, path
  INTO invalid_row
  FROM invalid
  WHERE path IS NOT NULL
  LIMIT 1;

  IF invalid_row.id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot migrate workouts.execution to v2 automatically. Workout % has unsupported legacy data at %', invalid_row.id, invalid_row.path;
  END IF;
END;
$$;

UPDATE workouts
SET execution = pg_temp.migrate_execution_node(execution, true),
    updated_at = now()
WHERE execution IS NOT NULL;
