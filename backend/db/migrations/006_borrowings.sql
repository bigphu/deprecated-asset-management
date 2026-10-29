-- US-11 (return a borrowed asset) and US-12 (borrowing history).
-- Safe on Docker-bootstrapped databases: asset_loans already exists in the bootstrap schema.

INSERT INTO fw_permissions (permission_key, description) VALUES
  ('borrowings.view', 'View the borrowing history and active borrowings'),
  ('borrowings.return', 'Record the return of a borrowed asset')
ON CONFLICT (permission_key) DO NOTHING;

-- Built-in role permissions are immutable (fw_role_permissions_system_immutable),
-- so this migration is the only place that may extend them. The guard is
-- disabled only for these inserts, inside the migration transaction, and
-- re-enabled before it ends; test/borrowings.integration.test.mjs asserts it
-- is enabled afterwards. Viewer is deliberately not granted these keys.
ALTER TABLE fw_role_permissions DISABLE TRIGGER fw_role_permissions_system_immutable;

INSERT INTO fw_role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
  FROM fw_roles r
  JOIN fw_permissions p ON p.permission_key IN ('borrowings.view', 'borrowings.return')
 WHERE r.system_key IN ('admin', 'asset_manager')
ON CONFLICT (role_id, permission_key) DO NOTHING;

ALTER TABLE fw_role_permissions ENABLE TRIGGER fw_role_permissions_system_immutable;

-- Derived, never written: it cannot drift from the timestamps. "Overdue but
-- still out" depends on now(), which a stored expression may not use, so the
-- API exposes that as a separate isOverdue flag instead of a status.
ALTER TABLE asset_loans
  ADD COLUMN IF NOT EXISTS status varchar(20) GENERATED ALWAYS AS (
    CASE
      WHEN returned_at IS NULL THEN 'ACTIVE'
      WHEN due_at IS NOT NULL AND returned_at > due_at THEN 'OVERDUE_RETURNED'
      ELSE 'RETURNED'
    END
  ) STORED;

-- Matches the history's default order (ORDER BY borrowed_at DESC NULLS LAST, id).
CREATE INDEX IF NOT EXISTS idx_asset_loans_borrowed_at
  ON asset_loans (borrowed_at DESC NULLS LAST, id);
