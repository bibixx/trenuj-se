ALTER TABLE "activities" ADD COLUMN "stream_channels" text[];--> statement-breakpoint
-- Custom SQL below (paired with the stream_channels column above).
--
-- activities.stream_channels caches which stream columns actually contain data for the
-- activity (streams_status = 'synced' alone doesn't say — cadence/temp_c/watts are often
-- entirely NULL). Maintained by a statement-level trigger on activity_streams so ANY writer
-- (today's strava_ingest_activity_streams, future FIT/GPX ingest) keeps it correct without
-- having to remember it exists.

CREATE FUNCTION public.activity_streams_sync_channels()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Both triggers expose their transition table under the same alias ("affected").
  UPDATE public.activities a
  SET stream_channels = c.channels
  FROM (
    SELECT s.activity_id,
           array_remove(ARRAY[
             CASE WHEN count(s.distance_m)   > 0 THEN 'distance_m'   END,
             CASE WHEN count(s.velocity_mps) > 0 THEN 'velocity_mps' END,
             CASE WHEN count(s.altitude_m)   > 0 THEN 'altitude_m'   END,
             CASE WHEN count(s.grade_pct)    > 0 THEN 'grade_pct'    END,
             CASE WHEN count(s.hr)           > 0 THEN 'hr'           END,
             CASE WHEN count(s.watts)        > 0 THEN 'watts'        END,
             CASE WHEN count(s.cadence)      > 0 THEN 'cadence'      END,
             CASE WHEN count(s.temp_c)       > 0 THEN 'temp_c'       END,
             CASE WHEN count(s.moving)       > 0 THEN 'moving'       END
           ], NULL) AS channels
    FROM public.activity_streams s
    WHERE s.activity_id IN (SELECT DISTINCT activity_id FROM affected)
    GROUP BY s.activity_id
  ) c
  WHERE a.id = c.activity_id;

  -- Activities whose stream rows were all deleted have no group above: clear the cache.
  UPDATE public.activities a
  SET stream_channels = NULL
  WHERE a.id IN (SELECT DISTINCT activity_id FROM affected)
    AND NOT EXISTS (SELECT 1 FROM public.activity_streams s WHERE s.activity_id = a.id);

  RETURN NULL;
END;
$$;

CREATE TRIGGER activity_streams_channels_ins
AFTER INSERT ON public.activity_streams
REFERENCING NEW TABLE AS affected
FOR EACH STATEMENT
EXECUTE FUNCTION public.activity_streams_sync_channels();

CREATE TRIGGER activity_streams_channels_del
AFTER DELETE ON public.activity_streams
REFERENCING OLD TABLE AS affected
FOR EACH STATEMENT
EXECUTE FUNCTION public.activity_streams_sync_channels();

-- One-time backfill for activities synced before this migration.
UPDATE public.activities a
SET stream_channels = c.channels
FROM (
  SELECT s.activity_id,
         array_remove(ARRAY[
           CASE WHEN count(s.distance_m)   > 0 THEN 'distance_m'   END,
           CASE WHEN count(s.velocity_mps) > 0 THEN 'velocity_mps' END,
           CASE WHEN count(s.altitude_m)   > 0 THEN 'altitude_m'   END,
           CASE WHEN count(s.grade_pct)    > 0 THEN 'grade_pct'    END,
           CASE WHEN count(s.hr)           > 0 THEN 'hr'           END,
           CASE WHEN count(s.watts)        > 0 THEN 'watts'        END,
           CASE WHEN count(s.cadence)      > 0 THEN 'cadence'      END,
           CASE WHEN count(s.temp_c)       > 0 THEN 'temp_c'       END,
           CASE WHEN count(s.moving)       > 0 THEN 'moving'       END
         ], NULL) AS channels
  FROM public.activity_streams s
  GROUP BY s.activity_id
) c
WHERE a.id = c.activity_id;

-- Make the new column visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
