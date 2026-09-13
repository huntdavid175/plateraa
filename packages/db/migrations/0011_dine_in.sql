-- Order types are how the customer gets the food (13 Sep): Dine-in, Pickup or Delivery.
-- There was no dine-in before, so walk-ins taken so far become Pickup.
ALTER TABLE "orders" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "orders" SET "type" = 'PICKUP' WHERE "type" = 'WALK_IN';--> statement-breakpoint
DROP TYPE "public"."order_type";--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('DINE_IN', 'PICKUP', 'DELIVERY');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "type" SET DATA TYPE "public"."order_type" USING "type"::"public"."order_type";--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "offers_dine_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Businesses where people usually sit down to eat start with dine-in on (DINE_IN_VENDOR_TYPES).
UPDATE "tenant_settings" SET "offers_dine_in" = true
  WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "vendor_type" IN ('CHOP_BAR', 'FAST_FOOD', 'CAFE_BAKERY'));
