-- Opening hours per day (16 Sep, user request): the free-text line becomes a week of times the
-- store keeps, so the storefront can close itself and refuse orders outside them. What vendors
-- typed by hand can't become JSON, so the old column goes and every store starts on 8am-8pm.
ALTER TABLE "tenant_settings" DROP COLUMN "storefront_hours";--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "storefront_hours" jsonb DEFAULT '{"mon":{"open":true,"from":"08:00","to":"20:00"},"tue":{"open":true,"from":"08:00","to":"20:00"},"wed":{"open":true,"from":"08:00","to":"20:00"},"thu":{"open":true,"from":"08:00","to":"20:00"},"fri":{"open":true,"from":"08:00","to":"20:00"},"sat":{"open":true,"from":"08:00","to":"20:00"},"sun":{"open":true,"from":"08:00","to":"20:00"}}'::jsonb NOT NULL;
