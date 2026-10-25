-- Demo data for the borrowing screens, API and Postman collection (US-11 / US-12).
-- There is no checkout endpoint yet, so open borrowings are loaded with SQL.
--
-- Before running it, create the staff user it attributes the records to:
--   npm run user:create -- --email admin@demo.test --display-name "Alex Morgan" --bootstrap-admin   (from backend/)
-- Then:  psql -h localhost -U asset_app -d asset_management -f docs/api/borrowings-demo-seed.sql
--
-- Adds six assets: four on loan (one overdue, one with no due date) and two already returned (one late).
-- Not idempotent: asset tags are unique, so a second run fails. Demo data only, never run it on real data.
WITH admin AS (SELECT id FROM fw_users WHERE email = 'admin@demo.test'),
a AS (
  INSERT INTO assets (asset_tag, name, asset_type_id, asset_status_id, purchase_date, location_id, created_by_user_id, updated_by_user_id)
  SELECT v.tag, v.name, t.id, s.id, v.purchased::date, l.id, admin.id, admin.id
    FROM (VALUES
      ('LAP-1001', 'Dell Latitude 5440',   'LAPTOP',         'ON_LOAN',   '2024-02-14'),
      ('LAP-1002', 'MacBook Pro 14"',      'LAPTOP',         'ON_LOAN',   '2024-05-02'),
      ('MON-2001', 'Dell U2723QE Monitor', 'MONITOR',        'ON_LOAN',   '2023-11-20'),
      ('PRN-3001', 'HP LaserJet Pro M404', 'PRINTER',        'ON_LOAN',   '2022-08-09'),
      ('MOB-4001', 'iPhone 14',            'MOBILE_DEVICE',  'AVAILABLE', '2023-03-18'),
      ('NET-5001', 'Cisco Catalyst 9200',  'NETWORK_DEVICE', 'AVAILABLE', '2021-12-01')
    ) AS v(tag, name, type, status, purchased)
    JOIN asset_types t ON t.code = v.type
    JOIN asset_statuses s ON s.code = v.status
    JOIN locations l ON l.code = 'HQ'
    CROSS JOIN admin
  RETURNING id, asset_tag::text AS tag
)
INSERT INTO asset_loans (asset_id, borrower_name, borrowed_at, due_at, returned_at, note, created_by_user_id, returned_by_user_id)
SELECT a.id, v.borrower, now() - v.borrowed::interval, now() - v.due::interval,
       CASE WHEN v.returned IS NULL THEN NULL ELSE now() - v.returned::interval END,
       v.note, admin.id, CASE WHEN v.returned IS NULL THEN NULL ELSE admin.id END
  FROM (VALUES
    ('LAP-1001', 'Nguyễn Văn An',   '5 days',  '-2 days',  NULL,      'Field audit in Da Nang'),
    ('LAP-1002', 'Trần Thị Bích',   '10 days', '3 days',   NULL,      'Design review; needs charger'),
    ('MON-2001', 'Lê Minh Châu',    '2 days',  '-7 days',  NULL,      NULL),
    ('PRN-3001', 'Phạm Quốc Dũng',  '1 day',   NULL,       NULL,      'Temporary, no end date'),
    ('MOB-4001', 'Hoàng Gia Hân',   '20 days', '15 days',  '16 days', NULL),
    ('NET-5001', 'Võ Thành Long',   '30 days', '12 days',  '9 days',  'Returned after the deadline')
  ) AS v(tag, borrower, borrowed, due, returned, note)
  JOIN a ON a.tag = v.tag
  CROSS JOIN (SELECT id FROM fw_users WHERE email = 'admin@demo.test') admin;
