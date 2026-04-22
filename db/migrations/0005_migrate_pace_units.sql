-- Migrate workouts.execution pace cues to the new shape.
--   * unit "speed-kmh" -> "km/h"
--   * unit "speed-mph" -> "mph"
--   * unit "min/km"/"min/mi" with numeric min/max -> "M:SS" string (value interpreted as seconds)
--   * unit "min/km"/"min/mi" with string min/max already matching "^\d{1,2}:\d{2}$" -> left alone
-- Anything else is left untouched; the read path (safeParseWorkoutExecution) will reject it
-- and a human can eyeball it.

CREATE OR REPLACE FUNCTION pg_temp.seconds_to_mmss(total_seconds int) RETURNS text AS $$
BEGIN
  RETURN (total_seconds / 60)::text || ':' || lpad((total_seconds % 60)::text, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.rewrite_pace_bound(value jsonb) RETURNS jsonb AS $$
DECLARE
  seconds int;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) = 'null' THEN
    RETURN value;
  END IF;

  IF jsonb_typeof(value) = 'number' THEN
    seconds := (value #>> '{}')::numeric;
    RETURN to_jsonb(pg_temp.seconds_to_mmss(seconds));
  END IF;

  -- Already a string; leave as-is (validator rejects if malformed).
  RETURN value;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.rewrite_pace_cue(node jsonb) RETURNS jsonb AS $$
DECLARE
  unit text;
  result jsonb;
BEGIN
  unit := node->>'unit';
  result := node;

  IF unit = 'speed-kmh' THEN
    result := jsonb_set(result, '{unit}', to_jsonb('km/h'::text));
  ELSIF unit = 'speed-mph' THEN
    result := jsonb_set(result, '{unit}', to_jsonb('mph'::text));
  ELSIF unit IN ('min/km', 'min/mi') THEN
    IF result ? 'min' THEN
      result := jsonb_set(result, '{min}', pg_temp.rewrite_pace_bound(result->'min'));
    END IF;
    IF result ? 'max' THEN
      result := jsonb_set(result, '{max}', pg_temp.rewrite_pace_bound(result->'max'));
    END IF;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.migrate_pace_node(node jsonb) RETURNS jsonb AS $$
DECLARE
  key text;
  value jsonb;
  result jsonb;
  unit text;
  item jsonb;
  new_array jsonb;
BEGIN
  IF node IS NULL THEN
    RETURN node;
  END IF;

  IF jsonb_typeof(node) = 'object' THEN
    unit := node->>'unit';
    IF unit IN ('min/km', 'min/mi', 'speed-kmh', 'speed-mph', 'km/h', 'mph') THEN
      RETURN pg_temp.rewrite_pace_cue(node);
    END IF;

    result := '{}'::jsonb;
    FOR key, value IN SELECT * FROM jsonb_each(node) LOOP
      result := result || jsonb_build_object(key, pg_temp.migrate_pace_node(value));
    END LOOP;
    RETURN result;
  END IF;

  IF jsonb_typeof(node) = 'array' THEN
    new_array := '[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(node) LOOP
      new_array := new_array || jsonb_build_array(pg_temp.migrate_pace_node(item));
    END LOOP;
    RETURN new_array;
  END IF;

  RETURN node;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE workouts
SET execution = pg_temp.migrate_pace_node(execution),
    updated_at = now()
WHERE execution IS NOT NULL;
