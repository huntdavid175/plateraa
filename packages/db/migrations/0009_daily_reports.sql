CREATE TABLE "daily_reports" (
	"tenant_id" text NOT NULL,
	"business_date" date NOT NULL,
	"version" integer NOT NULL,
	"figures" jsonb NOT NULL,
	"as_of" "xid8" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reports_tenant_id_business_date_pk" PRIMARY KEY("tenant_id","business_date")
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "sync_xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_sync" ON "expenses" USING btree ("tenant_id","sync_xid");--> statement-breakpoint
-- RLS on daily_reports, and the sync_xid trigger on expenses.
SELECT secure_tenant_tables();