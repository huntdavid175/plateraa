ALTER TABLE "devices" ADD COLUMN "pending_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "oldest_pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pushes_since_sync" integer DEFAULT 0 NOT NULL;