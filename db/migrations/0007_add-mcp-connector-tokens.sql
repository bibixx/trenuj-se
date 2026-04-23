CREATE TABLE "mcp_connector_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_connector_tokens" ADD CONSTRAINT "mcp_connector_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connector_tokens_hash_unique" ON "mcp_connector_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mcp_connector_tokens_user_created" ON "mcp_connector_tokens" USING btree ("user_id","created_at");
--> statement-breakpoint
ALTER TABLE public.mcp_connector_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "select_own" ON public.mcp_connector_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.mcp_connector_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.mcp_connector_tokens FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.mcp_connector_tokens FOR DELETE USING (auth.uid() = user_id);