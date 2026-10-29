/**
 * US-11 (return a borrowed asset) and US-12 (borrowing history), over HTTP
 * against a freshly built test database. Skipped, with the reason printed,
 * when PostgreSQL is not reachable:
 *
 *   DB_PORT=55432 npm test     # compose db published on a non-default port
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { recreateTestDatabase } = require('./helpers/testDb');
const skip = await recreateTestDatabase();

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Standard user password 1';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

let server;
let baseUrl;
let pool;
let adminUser;
let managerUser;
let viewerUser;
let borrowerUser;
let otherBorrowerUser;
let admin;
let manager;
let viewer;
let borrower;
let tagSeq = 0;

class ApiClient {
  constructor() {
    this.cookie = null;
    this.csrfToken = null;
  }

  async request(method, path, body, options = {}) {
    const headers = { Origin: options.origin === undefined ? ORIGIN : options.origin };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie && options.auth !== false) headers.Cookie = this.cookie;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/sign-in' && options.csrf !== false) {
      headers['X-CSRF-Token'] = options.csrf || this.csrfToken;
    }
    if (headers.Origin === null) delete headers.Origin;

    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = response.headers.get('content-type') || '';
    const parsed = response.status === 204 ? null : type.includes('json') ? await response.json() : null;
    return { status: response.status, body: parsed, headers: response.headers };
  }

  async signIn(email) {
    const response = await this.request('POST', '/auth/sign-in', { email, password: PASSWORD }, { auth: false });
    assert.equal(response.status, 200, `sign-in as ${email}`);
    this.cookie = response.headers.get('set-cookie').split(';', 1)[0];
    this.csrfToken = response.body.csrfToken;
    return this;
  }
}

async function assignSystemRole(userId, systemKey) {
  await pool.query(
    `INSERT INTO fw_user_roles (user_id, role_id) SELECT $1, id FROM fw_roles WHERE system_key = $2`,
    [userId, systemKey],
  );
}

/** Direct SQL: there is no checkout endpoint yet, so tests (and demos) seed loans like this. */
async function insertAsset({ status = 'AVAILABLE', archived = false, name } = {}) {
  tagSeq += 1;
  const tag = `BRW-${String(tagSeq).padStart(4, '0')}`;
  const { rows } = await pool.query(
    `INSERT INTO assets (asset_tag, name, asset_type_id, asset_status_id, purchase_date, location_id,
                         created_by_user_id, updated_by_user_id, deleted_at)
     SELECT $1, $2, t.id, s.id, '2024-01-15', l.id, $3, $3, CASE WHEN $5::boolean THEN now() END
       FROM asset_types t, asset_statuses s, locations l
      WHERE t.code = 'LAPTOP' AND s.code = $4 AND l.code = 'HQ'
     RETURNING id, asset_tag::text AS tag`,
    [tag, name || `Laptop ${tag}`, adminUser.id, status, archived],
  );
  return rows[0];
}

async function insertLoan(
  assetId,
  { borrower = 'Nguyễn Văn An', borrowedAt, dueAt = null, returnedAt = null, borrowerUserId = null } = {},
) {
  const { rows } = await pool.query(
    `INSERT INTO asset_loans (asset_id, borrower_name, borrowed_at, due_at, returned_at,
                              created_by_user_id, returned_by_user_id, borrower_user_id)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6, CASE WHEN $5::timestamptz IS NULL THEN NULL ELSE $6::uuid END, $7)
     RETURNING id`,
    [assetId, borrower, borrowedAt || new Date(Date.now() - 3 * DAY), dueAt, returnedAt, adminUser.id, borrowerUserId],
  );
  return rows[0].id;
}

/** An asset that is on loan: status ON_LOAN plus one open loan. */
async function openLoan({
  dueInMs = 2 * DAY, borrower, archived = false, status = 'ON_LOAN', name, borrowedAt = new Date(Date.now() - 3 * DAY),
  borrowerUserId,
} = {}) {
  const asset = await insertAsset({ status, archived, name });
  const id = await insertLoan(asset.id, {
    borrower,
    borrowedAt,
    dueAt: dueInMs === null ? null : new Date(Date.now() + dueInMs),
    borrowerUserId,
  });
  return { id, asset };
}

/** A loan that was already returned (available asset, returned_at set). */
async function closedLoan({ borrower, borrowedAt, dueAt = null, returnedAt, borrowerUserId }) {
  const asset = await insertAsset();
  return { id: await insertLoan(asset.id, { borrower, borrowedAt, dueAt, returnedAt, borrowerUserId }), asset };
}

describe('borrowings', { skip: skip || false }, () => {
  before(async () => {
    const app = require('../app');
    pool = require('../db/pool').pool;
    const { provisionUser } = require('../services/provisioning.service');

    adminUser = await provisionUser({
      email: 'admin@example.test', displayName: 'System Admin', password: PASSWORD, bootstrapAdmin: true,
    });
    managerUser = await provisionUser({ email: 'manager@example.test', displayName: 'Manager User', password: PASSWORD });
    await assignSystemRole(managerUser.id, 'asset_manager');
    viewerUser = await provisionUser({ email: 'viewer@example.test', displayName: 'Viewer User', password: PASSWORD });
    await assignSystemRole(viewerUser.id, 'viewer');
    borrowerUser = await provisionUser({ email: 'borrower@example.test', displayName: 'Bao Borrower', password: PASSWORD });
    await assignSystemRole(borrowerUser.id, 'borrower');
    otherBorrowerUser = await provisionUser({ email: 'borrower2@example.test', displayName: 'Bich Borrower', password: PASSWORD });
    await assignSystemRole(otherBorrowerUser.id, 'borrower');

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    admin = await new ApiClient().signIn('admin@example.test');
    manager = await new ApiClient().signIn('manager@example.test');
    viewer = await new ApiClient().signIn('viewer@example.test');
    borrower = await new ApiClient().signIn('borrower@example.test');
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  describe('schema (migration 006)', () => {
    async function permissionsOf(systemKey) {
      const { rows } = await pool.query(
        `SELECT rp.permission_key
           FROM fw_roles r JOIN fw_role_permissions rp ON rp.role_id = r.id
          WHERE r.system_key = $1 AND rp.permission_key LIKE 'borrowings.%'
          ORDER BY rp.permission_key`,
        [systemKey],
      );
      return rows.map((row) => row.permission_key);
    }

    test('Admin and Asset Manager may view and return; Viewer may do neither', async () => {
      assert.deepEqual(await permissionsOf('admin'), ['borrowings.return', 'borrowings.view', 'borrowings.viewOwn']);
      assert.deepEqual(await permissionsOf('asset_manager'), ['borrowings.return', 'borrowings.view']);
      assert.deepEqual(await permissionsOf('viewer'), []);
    });

    test('Admin holds every permission, Asset Manager may read the activity log, Borrower may only view their own history', async () => {
      const keysOf = async (systemKey) =>
        (await pool.query(
          `SELECT rp.permission_key FROM fw_roles r JOIN fw_role_permissions rp ON rp.role_id = r.id
            WHERE r.system_key = $1 ORDER BY rp.permission_key`,
          [systemKey],
        )).rows.map((row) => row.permission_key);
      const all = (await pool.query('SELECT permission_key FROM fw_permissions ORDER BY permission_key')).rows.map((row) => row.permission_key);

      assert.deepEqual(await keysOf('admin'), all);
      assert.ok((await keysOf('asset_manager')).includes('activity.view'));
      assert.ok(!(await keysOf('viewer')).some((key) => key.startsWith('borrowings.') || key === 'activity.view'));
      assert.deepEqual(await keysOf('borrower'), ['borrowings.viewOwn']);
    });

    test('toggling the system-role guard during the migration left it enabled and effective', async () => {
      const trigger = await pool.query(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'fw_role_permissions_system_immutable'`,
      );
      assert.equal(trigger.rows.length, 1);
      assert.equal(trigger.rows[0].tgenabled, 'O');
      await assert.rejects(
        pool.query(
          `INSERT INTO fw_role_permissions (role_id, permission_key)
           SELECT id, 'borrowings.return' FROM fw_roles WHERE system_key = 'viewer'`,
        ),
        /built-in system-role permissions are immutable/,
      );
    });

    test('a borrowing record cannot be deleted: it is the audit history', async () => {
      const { id } = await openLoan();
      await assert.rejects(pool.query('DELETE FROM asset_loans WHERE id = $1', [id]), /cannot be deleted/);
      assert.equal((await pool.query('SELECT 1 FROM asset_loans WHERE id = $1', [id])).rowCount, 1);
    });

    test('borrower_user_id must name a real user', async () => {
      const asset = await insertAsset();
      await assert.rejects(
        pool.query(
          `INSERT INTO asset_loans (asset_id, borrower_name, created_by_user_id, borrower_user_id)
           VALUES ($1, 'Nobody', $2, '00000000-0000-4000-8000-000000000000')`,
          [asset.id, adminUser.id],
        ),
        (err) => err.code === '23503',
      );
    });

    test('status is derived from returned_at and due_at and cannot be written', async () => {
      const at = (ms) => new Date(Date.now() + ms);
      const statusOf = async (loanId) =>
        (await pool.query('SELECT status FROM asset_loans WHERE id = $1', [loanId])).rows[0].status;
      const loan = async (fields) => insertLoan((await insertAsset()).id, { borrowedAt: at(-5 * DAY), ...fields });

      assert.equal(await statusOf(await loan({ dueAt: at(DAY) })), 'ACTIVE');
      assert.equal(await statusOf(await loan({ dueAt: at(-DAY) })), 'ACTIVE', 'overdue but still out is not a status');
      assert.equal(await statusOf(await loan({ dueAt: at(-DAY), returnedAt: at(-2 * DAY) })), 'RETURNED');
      assert.equal(await statusOf(await loan({ dueAt: at(-2 * DAY), returnedAt: at(-DAY) })), 'OVERDUE_RETURNED');
      assert.equal(await statusOf(await loan({ dueAt: null, returnedAt: at(-DAY) })), 'RETURNED');

      const id = await loan({});
      await assert.rejects(pool.query(`UPDATE asset_loans SET status = 'RETURNED' WHERE id = $1`, [id]), /can only be updated to DEFAULT/);
    });
  });

  describe('POST /borrowings/:id/return', () => {
    const returnLoan = (client, id, options) => client.request('POST', `/borrowings/${id}/return`, undefined, options);
    const returnedEvents = async (assetId) =>
      (await pool.query(
        `SELECT actor_user_id, description, details FROM asset_events WHERE asset_id = $1 AND event_type = 'returned'`,
        [assetId],
      )).rows;
    const loanRow = async (id) =>
      (await pool.query('SELECT returned_at, returned_by_user_id, status FROM asset_loans WHERE id = $1', [id])).rows[0];
    const assetRow = async (id) =>
      (await pool.query(
        `SELECT s.code AS status, a.deleted_at
           FROM assets a JOIN asset_statuses s ON s.id = a.asset_status_id WHERE a.id = $1`,
        [id],
      )).rows[0];

    test('records the return time and actor, frees the asset and writes one audit event', async () => {
      const { id, asset } = await openLoan({ dueInMs: 2 * DAY });
      const before = Date.now();
      const res = await returnLoan(manager, id);

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.id, id);
      assert.equal(res.body.status, 'RETURNED');
      assert.equal(res.body.isOverdue, false);
      assert.ok(Math.abs(Date.parse(res.body.returnedAt) - before) < 10_000, 'returnedAt is the current time');
      assert.deepEqual(res.body.returnedBy, { id: managerUser.id, displayName: 'Manager User' });
      assert.equal(res.body.asset.status, 'AVAILABLE');
      assert.equal((await assetRow(asset.id)).status, 'AVAILABLE');

      const row = await loanRow(id);
      assert.equal(row.status, 'RETURNED');
      assert.equal(row.returned_by_user_id, managerUser.id);
      const events = await returnedEvents(asset.id);
      assert.equal(events.length, 1);
      assert.equal(events[0].actor_user_id, managerUser.id);
      assert.equal(events[0].details.loanId, id);
      // The timeline is append-only and readable beyond borrowings.view, so it must not copy the borrower's name.
      assert.ok(!JSON.stringify(events[0]).includes('Nguyễn'), 'borrower name stays out of asset_events');
    });

    test('a return after the due date is OVERDUE_RETURNED; without a due date it is RETURNED', async () => {
      const late = await openLoan({ dueInMs: -DAY });
      const lateRes = await returnLoan(admin, late.id);
      assert.equal(lateRes.status, 200);
      assert.equal(lateRes.body.status, 'OVERDUE_RETURNED');
      assert.equal(lateRes.body.isOverdue, false, 'a returned record is no longer overdue');

      const open = await openLoan({ dueInMs: null });
      const openRes = await returnLoan(admin, open.id);
      assert.equal(openRes.body.status, 'RETURNED');
      assert.equal(openRes.body.dueAt, null);
    });

    test('returning twice is a 409 that changes nothing; a simultaneous double return has one winner', async () => {
      const { id, asset } = await openLoan();
      assert.equal((await returnLoan(admin, id)).status, 200);
      const firstReturnedAt = (await loanRow(id)).returned_at;

      const again = await returnLoan(manager, id);
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'ALREADY_RETURNED');
      assert.deepEqual((await loanRow(id)).returned_at, firstReturnedAt);
      assert.equal((await returnedEvents(asset.id)).length, 1);

      // Deterministic overlap: another connection holds the row lock while both requests start. A plain
      // read would let both see the loan as open and both succeed; only FOR UPDATE makes one of them lose.
      const race = await openLoan();
      const holder = await pool.connect();
      let results;
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT 1 FROM asset_loans WHERE id = $1 FOR UPDATE', [race.id]);
        const pending = [returnLoan(admin, race.id), returnLoan(manager, race.id)];
        await new Promise((resolve) => setTimeout(resolve, 300));
        await holder.query('COMMIT');
        results = await Promise.all(pending);
      } finally {
        holder.release();
      }
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await returnedEvents(race.asset.id)).length, 1);
    });

    test('a failure while writing the audit event rolls the whole return back', async () => {
      const { id, asset } = await openLoan();
      await pool.query(`CREATE FUNCTION tmp_fail_returned_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.event_type = 'returned' THEN RAISE EXCEPTION 'simulated audit failure'; END IF;
          RETURN NEW;
        END $$`);
      await pool.query(`CREATE TRIGGER tmp_fail_returned_event BEFORE INSERT ON asset_events
        FOR EACH ROW EXECUTE FUNCTION tmp_fail_returned_event()`);
      try {
        assert.equal((await returnLoan(admin, id)).status, 500);
      } finally {
        await pool.query('DROP TRIGGER tmp_fail_returned_event ON asset_events');
        await pool.query('DROP FUNCTION tmp_fail_returned_event()');
      }
      assert.equal((await loanRow(id)).returned_at, null, 'the loan is still open');
      assert.equal((await assetRow(asset.id)).status, 'ON_LOAN', 'the asset is still on loan');
    });

    test('an archived asset can still be returned and stays archived', async () => {
      const { id, asset } = await openLoan({ archived: true });
      const res = await returnLoan(admin, id);
      assert.equal(res.status, 200);
      assert.equal(res.body.asset.archived, true);
      assert.notEqual((await assetRow(asset.id)).deleted_at, null);
    });

    test('only an ON_LOAN asset is moved to AVAILABLE; other statuses are left alone', async () => {
      const retired = await openLoan({ status: 'RETIRED' });
      assert.equal((await returnLoan(admin, retired.id)).status, 200);
      assert.equal((await assetRow(retired.asset.id)).status, 'RETIRED');

      const available = await openLoan({ status: 'AVAILABLE' });
      assert.equal((await returnLoan(admin, available.id)).status, 200);
      assert.equal((await assetRow(available.asset.id)).status, 'AVAILABLE');
    });

    test('an unknown or malformed id is a 404', async () => {
      const unknown = await returnLoan(admin, '00000000-0000-4000-8000-000000000000');
      assert.equal(unknown.status, 404);
      assert.equal(unknown.body.error.code, 'NOT_FOUND');
      assert.equal((await returnLoan(admin, 'not-a-uuid')).status, 404);
    });

    test('Viewer, anonymous, CSRF-less and foreign-origin callers cannot return, and nothing changes', async () => {
      const { id, asset } = await openLoan();
      const denied = [
        [await returnLoan(viewer, id), 403, 'FORBIDDEN'],
        [await returnLoan(admin, id, { auth: false }), 401, 'UNAUTHENTICATED'],
        [await returnLoan(admin, id, { csrf: false }), 403, 'CSRF_FAILED'],
        [await returnLoan(admin, id, { origin: 'http://evil.example' }), 403, 'CSRF_FAILED'],
      ];
      for (const [res, status, code] of denied) {
        assert.equal(res.status, status, JSON.stringify(res.body));
        assert.equal(res.body.error.code, code);
      }
      assert.equal((await loanRow(id)).returned_at, null);
      assert.equal((await returnedEvents(asset.id)).length, 0);
      assert.equal((await assetRow(asset.id)).status, 'ON_LOAN');
    });
  });

  describe('GET /borrowings/history', () => {
    const history = (client, query = '', options) =>
      client.request('GET', `/borrowings/history${query ? '?' + query : ''}`, undefined, options);
    const marked = (marker, extra = '') => `search=${encodeURIComponent(marker)}${extra ? '&' + extra : ''}`;
    const ago = (days) => new Date(Date.now() - days * DAY);
    const ids = (res) => res.body.items.map((item) => item.id);

    test('lists every record newest first, joined with the asset and the people involved', async () => {
      const oldest = await closedLoan({ borrower: 'ZZORDER oldest', borrowedAt: ago(9), dueAt: ago(7), returnedAt: ago(8) });
      const middle = await closedLoan({ borrower: 'ZZORDER middle', borrowedAt: ago(6), dueAt: ago(4), returnedAt: ago(2) });
      const newest = await openLoan({ borrower: 'ZZORDER newest', borrowedAt: ago(1), dueInMs: 3 * DAY });

      const res = await history(admin, marked('ZZORDER'));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(ids(res), [newest.id, middle.id, oldest.id]);
      assert.deepEqual({ total: res.body.total, page: res.body.page, pageSize: res.body.pageSize }, { total: 3, page: 1, pageSize: 25 });

      const [open, overdueReturned, onTime] = res.body.items;
      assert.deepEqual(
        Object.keys(open).sort(),
        ['asset', 'borrowedAt', 'borrowerName', 'borrowerUserId', 'createdBy', 'dueAt', 'id', 'isOverdue', 'note', 'returnedAt', 'returnedBy', 'status'],
      );
      assert.deepEqual(
        Object.keys(open.asset).sort(),
        ['archived', 'id', 'name', 'status', 'statusName', 'tag', 'type', 'typeName'],
      );
      assert.deepEqual([open.status, overdueReturned.status, onTime.status], ['ACTIVE', 'OVERDUE_RETURNED', 'RETURNED']);
      assert.equal(open.asset.tag, newest.asset.tag);
      assert.equal(open.asset.type, 'LAPTOP');
      assert.deepEqual(open.createdBy, { id: adminUser.id, displayName: 'System Admin' });
      assert.equal(open.returnedBy, null);
      assert.equal(open.returnedAt, null);
      assert.deepEqual(overdueReturned.returnedBy, { id: adminUser.id, displayName: 'System Admin' });
    });

    test('filters by one or several statuses', async () => {
      await openLoan({ borrower: 'ZZSTAT active' });
      await closedLoan({ borrower: 'ZZSTAT returned', borrowedAt: ago(5), dueAt: ago(1), returnedAt: ago(2) });
      await closedLoan({ borrower: 'ZZSTAT late', borrowedAt: ago(5), dueAt: ago(3), returnedAt: ago(2) });

      const status = async (query) => (await history(admin, marked('ZZSTAT', query))).body.items.map((i) => i.status).sort();
      assert.deepEqual(await status('status=ACTIVE'), ['ACTIVE']);
      assert.deepEqual(await status('status=RETURNED&status=OVERDUE_RETURNED'), ['OVERDUE_RETURNED', 'RETURNED']);
      assert.deepEqual(await status(''), ['ACTIVE', 'OVERDUE_RETURNED', 'RETURNED']);
    });

    test('search matches tag, asset name and borrower, and treats % _ \\ and diacritics literally', async () => {
      const names = ['ZZLIT 100% sure', 'ZZLIT 100X sure', 'ZZLIT a_b', 'ZZLIT aXb', 'ZZLIT c\\d', 'ZZLIT cXd', 'ZZLIT Trần Thị Bích'];
      const made = {};
      for (const borrower of names) made[borrower] = await openLoan({ borrower });
      const found = async (term) => (await history(admin, `search=${encodeURIComponent(term)}`)).body.items.map((i) => i.borrowerName);

      assert.deepEqual(await found('ZZLIT 100%'), ['ZZLIT 100% sure']);
      assert.deepEqual(await found('zzlit a_b'), ['ZZLIT a_b']);
      assert.deepEqual(await found('ZZLIT c\\d'), ['ZZLIT c\\d']);
      assert.deepEqual(await found('ZZLIT Trần Thị'), ['ZZLIT Trần Thị Bích']);

      const named = await openLoan({ borrower: 'ZZFIND someone', name: 'ZZNAME Projector' });
      assert.deepEqual(ids(await history(admin, marked('zzname projector'))), [named.id]);
      assert.deepEqual(ids(await history(admin, marked(named.asset.tag))), [named.id]);
    });

    test('pages with a stable order and answers a page past the end with no items', async () => {
      const made = [];
      for (let day = 1; day <= 5; day += 1) made.push(await openLoan({ borrower: `ZZPAGE ${day}`, borrowedAt: ago(day) }));
      const expected = made.map((loan) => loan.id);

      const pageOf = async (page) => history(admin, marked('ZZPAGE', `pageSize=2&page=${page}`));
      const [p1, p2, p3] = [await pageOf(1), await pageOf(2), await pageOf(3)];
      assert.deepEqual([ids(p1).length, ids(p2).length, ids(p3).length], [2, 2, 1]);
      assert.deepEqual([...ids(p1), ...ids(p2), ...ids(p3)], expected);
      assert.equal(p3.body.total, 5);

      const beyond = await pageOf(9);
      assert.equal(beyond.status, 200);
      assert.deepEqual(beyond.body, { items: [], total: 5, page: 9, pageSize: 2 });
    });

    test('sorts by due date with records that have none last in either direction', async () => {
      const d1 = await openLoan({ borrower: 'ZZSORT 1', dueInMs: DAY });
      const d2 = await openLoan({ borrower: 'ZZSORT 2', dueInMs: 2 * DAY });
      const none = await openLoan({ borrower: 'ZZSORT 3', dueInMs: null });
      assert.deepEqual(ids(await history(admin, marked('ZZSORT', 'sort=dueAt&direction=asc'))), [d1.id, d2.id, none.id]);
      assert.deepEqual(ids(await history(admin, marked('ZZSORT', 'sort=dueAt&direction=desc'))), [d2.id, d1.id, none.id]);
    });

    test('sorts by returned date, borrower and asset tag', async () => {
      const a = await closedLoan({ borrower: 'ZZKEY b-mid', borrowedAt: ago(9), returnedAt: ago(5) });
      const b = await closedLoan({ borrower: 'ZZKEY a-first', borrowedAt: ago(8), returnedAt: ago(3) });
      const c = await openLoan({ borrower: 'ZZKEY c-last', borrowedAt: ago(7) });
      const order = async (query) => ids(await history(admin, marked('ZZKEY', query)));

      assert.deepEqual(await order('sort=borrower&direction=asc'), [b.id, a.id, c.id]);
      assert.deepEqual(await order('sort=returnedAt&direction=desc'), [b.id, a.id, c.id]);
      assert.deepEqual(await order('sort=returnedAt&direction=asc'), [a.id, b.id, c.id], 'not returned yet sorts last');
      assert.deepEqual(await order('sort=asset&direction=asc'), [a.id, b.id, c.id], 'tags were issued a < b < c');
      assert.deepEqual(await order('sort=asset&direction=desc'), [c.id, b.id, a.id]);
    });

    test('isOverdue is true only for an open record past its due date', async () => {
      const late = await openLoan({ borrower: 'ZZOVER late', dueInMs: -DAY });
      const soon = await openLoan({ borrower: 'ZZOVER soon', dueInMs: DAY });
      const none = await openLoan({ borrower: 'ZZOVER none', dueInMs: null });
      const items = Object.fromEntries((await history(admin, marked('ZZOVER'))).body.items.map((i) => [i.id, i]));
      assert.deepEqual([items[late.id].isOverdue, items[soon.id].isOverdue, items[none.id].isOverdue], [true, false, false]);
      assert.equal(items[late.id].status, 'ACTIVE');
    });

    test('records of archived assets stay in the history', async () => {
      const { id } = await openLoan({ borrower: 'ZZARCH x', archived: true });
      const res = await history(admin, marked('ZZARCH'));
      assert.deepEqual(ids(res), [id]);
      assert.equal(res.body.items[0].asset.archived, true);
    });

    test('rejects invalid query parameters with every bad field named', async () => {
      const cases = [
        ['status=FOO', 'status'],
        ['sort=deleted_at', 'sort'],
        ['direction=sideways', 'direction'],
        ['page=0', 'page'],
        ['pageSize=101', 'pageSize'],
        [`search=${'x'.repeat(101)}`, 'search'],
      ];
      for (const [query, field] of cases) {
        const res = await history(admin, query);
        assert.equal(res.status, 422, query);
        assert.equal(res.body.error.code, 'VALIDATION_FAILED');
        assert.ok(res.body.error.fields[field], `${query} names ${field}`);
      }
    });

    test('needs borrowings.view: Manager and Admin read it; Viewer and anonymous callers do not', async () => {
      assert.equal((await history(manager)).status, 200);
      assert.equal((await history(admin)).status, 200);
      const forbidden = await history(viewer);
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.error.code, 'FORBIDDEN');
      assert.equal((await history(admin, '', { auth: false })).status, 401);
    });
  });

  describe('who sees which history (US12-T4)', () => {
    const history = (client, query = '', options) =>
      client.request('GET', `/borrowings/history${query ? '?' + query : ''}`, undefined, options);
    const ids = (res) => res.body.items.map((item) => item.id);
    const ago = (days) => new Date(Date.now() - days * DAY);
    const deniedCount = async (userId) =>
      (await pool.query(
        `SELECT count(*)::int AS n FROM fw_security_events WHERE event_type = 'authz.permission_denied' AND actor_user_id = $1`,
        [userId],
      )).rows[0].n;
    async function eventually(check, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = await check();
        if (value || Date.now() > deadline) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    test('a borrower sees only their own records, however they ask', async () => {
      const own1 = await openLoan({ borrower: 'ZZOWN first', borrowerUserId: borrowerUser.id });
      const own2 = await closedLoan({
        borrower: 'ZZOWN second', borrowedAt: ago(6), dueAt: ago(4), returnedAt: ago(5), borrowerUserId: borrowerUser.id,
      });
      const others = await openLoan({ borrower: 'ZZOWN other account', borrowerUserId: otherBorrowerUser.id });
      const unlinked = await openLoan({ borrower: 'ZZOWN name only' });
      const mine = [own1.id, own2.id].sort();

      const everything = await history(borrower);
      assert.equal(everything.status, 200, JSON.stringify(everything.body));
      assert.deepEqual(ids(everything).sort(), mine);
      assert.equal(everything.body.total, 2);
      assert.ok(everything.body.items.every((item) => item.borrowerUserId === borrowerUser.id));
      // Naming themselves (in any letter case) is the same as not naming anyone, and a search cannot reach further.
      assert.deepEqual(ids(await history(borrower, `borrowerUserId=${borrowerUser.id.toUpperCase()}`)).sort(), mine);
      assert.deepEqual(ids(await history(borrower, 'search=ZZOWN')).sort(), mine);

      // Staff see every record, and may narrow the list to one user.
      assert.deepEqual(
        ids(await history(manager, 'search=ZZOWN')).sort(),
        [own1.id, own2.id, others.id, unlinked.id].sort(),
      );
      assert.deepEqual(ids(await history(manager, `borrowerUserId=${borrowerUser.id}`)).sort(), mine);
      assert.deepEqual(ids(await history(admin, `borrowerUserId=${otherBorrowerUser.id}`)), [others.id]);
    });

    test("asking for another user's history is a 403 that is recorded", async () => {
      for (const other of [managerUser.id, otherBorrowerUser.id.toUpperCase()]) {
        const before = await deniedCount(borrowerUser.id);
        const res = await history(borrower, `borrowerUserId=${other}`);
        assert.equal(res.status, 403, JSON.stringify(res.body));
        assert.equal(res.body.error.code, 'FORBIDDEN');
        assert.equal(res.body.error.message, 'You can only view your own borrowing history');
        assert.ok(await eventually(async () => (await deniedCount(borrowerUser.id)) > before), 'the refusal is logged');
      }
    });

    test('a borrower cannot return an asset, and nothing changes', async () => {
      const { id, asset } = await openLoan({ borrowerUserId: borrowerUser.id });
      const res = await borrower.request('POST', `/borrowings/${id}/return`);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
      assert.equal((await pool.query('SELECT returned_at FROM asset_loans WHERE id = $1', [id])).rows[0].returned_at, null);
      assert.equal(
        (await pool.query(
          `SELECT s.code FROM assets a JOIN asset_statuses s ON s.id = a.asset_status_id WHERE a.id = $1`,
          [asset.id],
        )).rows[0].code,
        'ON_LOAN',
      );
    });

    test('a malformed user id is a 422 for staff and borrowers alike', async () => {
      for (const client of [manager, borrower]) {
        const res = await history(client, 'borrowerUserId=not-a-user');
        assert.equal(res.status, 422);
        assert.ok(res.body.error.fields.borrowerUserId);
      }
    });
  });

  describe('after a return (US11-T4, US12-T5)', () => {
    const returnLoan = (client, id) => client.request('POST', `/borrowings/${id}/return`);
    const assetStatus = async (assetId) =>
      (await pool.query(
        `SELECT s.code FROM assets a JOIN asset_statuses s ON s.id = a.asset_status_id WHERE a.id = $1`,
        [assetId],
      )).rows[0].code;

    test('the borrowing record is preserved: only the return fields change and the asset is available again', async () => {
      const { id, asset } = await openLoan({ borrowerUserId: borrowerUser.id });
      const kept = async () =>
        (await pool.query(
          `SELECT asset_id, borrower_name, borrower_user_id, borrowed_at, due_at, note, created_by_user_id, created_at
             FROM asset_loans WHERE id = $1`,
          [id],
        )).rows[0];
      const rowsFor = async () =>
        (await pool.query('SELECT count(*)::int AS n FROM asset_loans WHERE asset_id = $1', [asset.id])).rows[0].n;
      const before = await kept();
      assert.equal(await assetStatus(asset.id), 'ON_LOAN');

      assert.equal((await returnLoan(manager, id)).status, 200);

      assert.deepEqual(await kept(), before, 'borrower, dates and author are untouched');
      assert.equal(await rowsFor(), 1, 'the record was not replaced or removed');
      assert.equal(await assetStatus(asset.id), 'AVAILABLE');
      const row = (await pool.query('SELECT returned_at, returned_by_user_id, status FROM asset_loans WHERE id = $1', [id])).rows[0];
      assert.equal(row.returned_by_user_id, managerUser.id);
      assert.notEqual(row.returned_at, null);
      assert.equal(row.status, 'RETURNED');
    });

    test('the same record moves from ACTIVE to RETURNED in the history, for staff and for its borrower', async () => {
      const { id } = await openLoan({ borrower: 'ZZFLOW', borrowerUserId: borrowerUser.id, dueInMs: DAY });
      const find = async (client, extra = '') =>
        (await client.request('GET', `/borrowings/history?search=ZZFLOW${extra}`)).body;

      const before = await find(manager);
      assert.equal(before.total, 1);
      assert.deepEqual(
        [before.items[0].id, before.items[0].status, before.items[0].returnedAt, before.items[0].returnedBy],
        [id, 'ACTIVE', null, null],
      );
      assert.deepEqual((await find(manager, '&status=ACTIVE')).items.map((item) => item.id), [id]);

      assert.equal((await returnLoan(manager, id)).status, 200);

      const after = await find(manager);
      assert.equal(after.total, 1, 'still listed: returning does not remove it from the history');
      assert.equal(after.items[0].id, id);
      assert.equal(after.items[0].status, 'RETURNED');
      assert.equal(after.items[0].asset.status, 'AVAILABLE');
      assert.deepEqual(after.items[0].returnedBy, { id: managerUser.id, displayName: 'Manager User' });
      assert.match(after.items[0].returnedAt, /^\d{4}-\d\d-\d\dT/);
      assert.equal((await find(manager, '&status=ACTIVE')).total, 0, 'no longer among the assets still out');
      assert.deepEqual((await find(manager, '&status=RETURNED')).items.map((item) => item.id), [id]);

      const mine = await find(borrower);
      assert.deepEqual([mine.items[0].id, mine.items[0].status], [id, 'RETURNED'], 'the borrower sees the same change');
    });
  });

  describe('activity log (US11-T5)', () => {
    const activity = (client, query = '', options) =>
      client.request('GET', `/activity${query ? '?' + query : ''}`, undefined, options);
    const returnLoan = (client, id, options) =>
      client.request('POST', `/borrowings/${id}/return`, undefined, options);
    const returnedTotal = async () => (await activity(manager, 'action=ASSET_RETURNED&pageSize=1')).body.total;

    test('a return is logged as ASSET_RETURNED with who did it and when', async () => {
      const { id, asset } = await openLoan({ borrower: 'ZZACT hidden borrower name' });
      const before = Date.now();
      assert.equal((await returnLoan(manager, id)).status, 200);

      const res = await activity(manager, 'action=ASSET_RETURNED');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const entry = res.body.items[0];
      assert.deepEqual(Object.keys(entry).sort(), ['action', 'actor', 'asset', 'description', 'id', 'occurredAt']);
      assert.equal(entry.action, 'ASSET_RETURNED');
      assert.deepEqual(entry.actor, { id: managerUser.id, displayName: 'Manager User' });
      assert.deepEqual(entry.asset, { id: asset.id, tag: asset.tag, name: `Laptop ${asset.tag}` });
      assert.equal(entry.description, `Asset ${asset.tag} returned`);
      assert.ok(Math.abs(Date.parse(entry.occurredAt) - before) < 10_000, 'timestamp is when the return happened');
      assert.ok(!JSON.stringify(res.body).includes('ZZACT'), 'the borrower name is not in the log');
      assert.ok(!JSON.stringify(res.body).includes('@'), 'no e-mail address is in the log');
    });

    test('invalid, refused and repeated returns add nothing to the log', async () => {
      const { id } = await openLoan();
      const start = await returnedTotal();

      assert.equal((await returnLoan(viewer, id)).status, 403);
      assert.equal((await returnLoan(borrower, id)).status, 403);
      assert.equal((await returnLoan(admin, id, { csrf: false })).status, 403);
      assert.equal((await returnLoan(admin, '00000000-0000-4000-8000-000000000000')).status, 404);
      assert.equal((await returnLoan(admin, 'not-a-uuid')).status, 404);
      assert.equal(await returnedTotal(), start, 'nothing was logged for requests that did not return anything');

      assert.equal((await returnLoan(manager, id)).status, 200);
      assert.equal(await returnedTotal(), start + 1);
      assert.equal((await returnLoan(admin, id)).status, 409);
      assert.equal(await returnedTotal(), start + 1, 'a repeated return is not logged a second time');
    });

    test('shows every kind of asset event newest first, filtered by action and paged', async () => {
      const created = await admin.request('POST', '/assets', {
        tag: 'ACT-0001', name: 'Activity laptop', type: 'LAPTOP', status: 'AVAILABLE', location: 'HQ', purchaseDate: '2024-01-15',
      });
      assert.equal(created.status, 201);
      assert.equal((await admin.request('DELETE', `/assets/${created.body.id}`)).status, 204);

      const kinds = async (query) => (await activity(admin, query)).body.items;
      const [newestCreated] = await kinds('action=ASSET_CREATED');
      assert.equal(newestCreated.asset.tag, 'ACT-0001');
      const [archived] = await kinds('action=asset_archived');
      assert.deepEqual([archived.action, archived.asset.tag], ['ASSET_ARCHIVED', 'ACT-0001'], 'archived assets still list');

      const both = await kinds('action=ASSET_ARCHIVED&action=ASSET_CREATED&pageSize=100');
      assert.ok(both.length >= 2 && both.every((item) => ['ASSET_ARCHIVED', 'ASSET_CREATED'].includes(item.action)));
      const times = (await kinds('pageSize=100')).map((item) => Date.parse(item.occurredAt));
      assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first');

      const first = await activity(admin, 'pageSize=2');
      const second = await activity(admin, 'pageSize=2&page=2');
      assert.equal(first.body.items.length, 2);
      assert.equal(second.body.total, first.body.total);
      assert.ok(!second.body.items.some((item) => first.body.items.some((other) => other.id === item.id)));
      const beyond = await activity(admin, 'pageSize=2&page=100000');
      assert.deepEqual([beyond.status, beyond.body.items.length, beyond.body.page], [200, 0, 100000]);
    });

    test('rejects invalid query parameters with every bad field named', async () => {
      for (const [query, field] of [['action=ASSET_NOPE', 'action'], ['page=0', 'page'], ['pageSize=101', 'pageSize']]) {
        const res = await activity(admin, query);
        assert.equal(res.status, 422, query);
        assert.ok(res.body.error.fields[field], `${query} names ${field}`);
      }
    });

    test('needs activity.view: Admin and Manager read it; Viewer, Borrower and anonymous callers do not', async () => {
      assert.equal((await activity(admin)).status, 200);
      assert.equal((await activity(manager)).status, 200);
      assert.equal((await activity(viewer)).status, 403);
      assert.equal((await activity(borrower)).status, 403);
      assert.equal((await activity(admin, '', { auth: false })).status, 401);
    });
  });
});
