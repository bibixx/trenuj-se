ALTER TABLE "profiles" ADD COLUMN "user_flags" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "profiles" SET "user_flags" = jsonb_build_object('is_premium', true) WHERE "is_premium" = true;
--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "is_premium";
--> statement-breakpoint
DROP POLICY IF EXISTS "update_own" ON "public"."profiles";
