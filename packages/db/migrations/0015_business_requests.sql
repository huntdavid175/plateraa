ALTER TYPE "public"."tenant_status" ADD VALUE 'PENDING';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "order_ways" text[];--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "approved_at" timestamp with time zone;