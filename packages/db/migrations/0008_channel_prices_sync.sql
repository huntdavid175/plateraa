ALTER TABLE "item_channel_prices" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_channel_prices" ADD COLUMN "sync_xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL;--> statement-breakpoint
CREATE INDEX "item_channel_prices_sync" ON "item_channel_prices" USING btree ("tenant_id","sync_xid");--> statement-breakpoint
-- item_channel_prices now syncs to the tablets: stamp sync_xid on every insert and update.
SELECT secure_tenant_tables();