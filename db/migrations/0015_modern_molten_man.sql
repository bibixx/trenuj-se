DROP TABLE "stream_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "strava_sync_state" DROP COLUMN "history_synced_from";--> statement-breakpoint
ALTER TABLE "strava_sync_state" DROP COLUMN "history_complete";--> statement-breakpoint
ALTER TABLE "strava_sync_state" DROP COLUMN "last_head_sync_at";