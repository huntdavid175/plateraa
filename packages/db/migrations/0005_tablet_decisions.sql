ALTER TABLE "item_channel_prices" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "platform_receivables" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "channel_commissions" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_source";--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('POS', 'PHONE', 'STOREFRONT', 'BOLT_FOOD', 'CHOWDECK', 'OTHER');--> statement-breakpoint
ALTER TABLE "item_channel_prices" ALTER COLUMN "source" SET DATA TYPE "public"."order_source" USING "source"::"public"."order_source";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "source" SET DATA TYPE "public"."order_source" USING "source"::"public"."order_source";--> statement-breakpoint
ALTER TABLE "platform_receivables" ALTER COLUMN "source" SET DATA TYPE "public"."order_source" USING "source"::"public"."order_source";--> statement-breakpoint
ALTER TABLE "channel_commissions" ALTER COLUMN "source" SET DATA TYPE "public"."order_source" USING "source"::"public"."order_source";--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "require_payment_before_prep" boolean DEFAULT true NOT NULL;