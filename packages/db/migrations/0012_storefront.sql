ALTER TABLE "staff_members" ADD COLUMN "system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pay_on_collection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "track_token" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_taking_orders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_cash_on_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_accept_first" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_theme" text DEFAULT 'orange' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_area" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_phone" text;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_hours" text;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_members_one_system_per_tenant" ON "staff_members" USING btree ("tenant_id") WHERE "staff_members"."system";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trackToken_unique" UNIQUE("track_token");