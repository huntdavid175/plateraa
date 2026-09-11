CREATE TYPE "public"."payment_link_status" AS ENUM('QUEUED', 'SENT', 'PAID', 'FAILED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'LINK';--> statement-breakpoint
CREATE TABLE "moolre_accounts" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"api_user" text NOT NULL,
	"public_key" text NOT NULL,
	"account_number" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"status" "payment_link_status" NOT NULL,
	"amount" bigint NOT NULL,
	"phone" text NOT NULL,
	"url" text,
	"provider_reference" text,
	"failure" text,
	"requested_by" text NOT NULL,
	"device_id" text,
	"payment_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at_device" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"sync_xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"provider" text NOT NULL,
	"reference" text,
	"source_ip" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
ALTER TABLE "moolre_accounts" ADD CONSTRAINT "moolre_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_requested_by_staff_members_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_links_order" ON "payment_links" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_links_status" ON "payment_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_links_sync" ON "payment_links" USING btree ("tenant_id","sync_xid");--> statement-breakpoint
CREATE INDEX "provider_events_reference" ON "provider_events" USING btree ("reference");--> statement-breakpoint
-- New tables: row-level security for each business, and the sync cursor on payment_links.
SELECT secure_tenant_tables();