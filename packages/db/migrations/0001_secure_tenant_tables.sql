-- Tenant isolation and sync tracking. Re-run `SELECT secure_tenant_tables();` at the end of any
-- future migration that adds tables; the RLS catalogue test fails if a table is left unprotected.

-- Runtime role. withTenant() switches to it inside every transaction, so row-level security
-- applies whichever role the connection logged in as.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_sync_xid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_xid := pg_current_xact_id();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION secure_tenant_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  -- Every table with a tenant_id (and tenants itself, keyed by id): enable + force RLS,
  -- one tenant policy, and table privileges for the runtime role.
  FOR t IN
    SELECT c.oid::regclass AS tbl,
           CASE WHEN c.relname = 'tenants' THEN 'id' ELSE 'tenant_id' END AS tenant_column
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (c.relname = 'tenants' OR EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped))
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t.tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s '
      'USING (%I = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK (%I = current_setting(''app.tenant_id'', true))',
      t.tbl, t.tenant_column, t.tenant_column);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO app_user', t.tbl);
  END LOOP;

  -- Every table the devices sync: stamp sync_xid on insert and update (the pull cursor).
  FOR t IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'sync_xid' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_sync_xid ON %s', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER set_sync_xid BEFORE INSERT OR UPDATE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION set_sync_xid()', t.tbl);
  END LOOP;

  -- The audit log is append-only for the runtime role.
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON audit_events FROM app_user;
  END IF;
END
$$;
--> statement-breakpoint
SELECT secure_tenant_tables();
