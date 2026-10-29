-- US-11 (borrowing records are preserved), US-11-T5 (activity log) and US-12-T4 (a borrower sees only
-- their own history). Safe on Docker-bootstrapped databases: asset_loans and asset_events already exist.

-- A loan may name the user who borrowed. Loans that only carry a name stay visible to staff only.
ALTER TABLE asset_loans ADD COLUMN IF NOT EXISTS borrower_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'asset_loans'::regclass AND conname = 'fk_asset_loans_borrower_user'
  ) THEN
    ALTER TABLE asset_loans
      ADD CONSTRAINT fk_asset_loans_borrower_user
      FOREIGN KEY (borrower_user_id) REFERENCES fw_users(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_asset_loans_borrower_user
  ON asset_loans (borrower_user_id, borrowed_at DESC)
  WHERE borrower_user_id IS NOT NULL;

-- A returned loan is history: it is never deleted (assets and asset_events are protected the same way).
CREATE OR REPLACE FUNCTION reject_asset_loan_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'asset_loans cannot be deleted; they are the borrowing audit history'
    USING ERRCODE = '23000';
END;
$$;

DROP TRIGGER IF EXISTS asset_loans_no_delete ON asset_loans;
CREATE TRIGGER asset_loans_no_delete
BEFORE DELETE ON asset_loans
FOR EACH ROW EXECUTE FUNCTION reject_asset_loan_delete();

-- Activity log order (newest first).
CREATE INDEX IF NOT EXISTS idx_asset_events_occurred
  ON asset_events (occurred_at DESC, id DESC);

INSERT INTO fw_permissions (permission_key, description) VALUES
  ('borrowings.viewOwn', 'View your own borrowing history'),
  ('activity.view', 'View the asset activity log')
ON CONFLICT (permission_key) DO NOTHING;

-- Built-in Borrower role. If an administrator already created a custom role with that name, the built-in
-- one takes the fallback name so this migration cannot fail startup.
ALTER TABLE fw_roles DROP CONSTRAINT IF EXISTS ck_fw_roles_system_key;
ALTER TABLE fw_roles
  ADD CONSTRAINT ck_fw_roles_system_key
  CHECK (system_key IS NULL OR system_key IN ('admin', 'asset_manager', 'viewer', 'borrower'));

INSERT INTO fw_roles (name, description, system_key)
SELECT CASE WHEN EXISTS (SELECT 1 FROM fw_roles WHERE name = 'Borrower') THEN 'Borrower (built-in)' ELSE 'Borrower' END,
       'Built-in role for people who borrow assets: sees only their own borrowing history.',
       'borrower'
 WHERE NOT EXISTS (SELECT 1 FROM fw_roles WHERE system_key = 'borrower');

-- Built-in role grants are immutable, so only a migration may extend them (see 006). The guard is off
-- only for these inserts, inside the migration transaction, and on again before it ends.
ALTER TABLE fw_role_permissions DISABLE TRIGGER fw_role_permissions_system_immutable;

-- Admin keeps "every permission".
INSERT INTO fw_role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
  FROM fw_roles r CROSS JOIN fw_permissions p
 WHERE r.system_key = 'admin'
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO fw_role_permissions (role_id, permission_key)
SELECT r.id, 'activity.view' FROM fw_roles r WHERE r.system_key = 'asset_manager'
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO fw_role_permissions (role_id, permission_key)
SELECT r.id, 'borrowings.viewOwn' FROM fw_roles r WHERE r.system_key = 'borrower'
ON CONFLICT (role_id, permission_key) DO NOTHING;

ALTER TABLE fw_role_permissions ENABLE TRIGGER fw_role_permissions_system_immutable;
