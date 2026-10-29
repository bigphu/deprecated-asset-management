const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCreateAsset, parseUpdateAsset, parseListQuery } = require('../api/dto/assets.dto');
const { parseProfileInput, toProfileDto } = require('../api/dto/exportProfiles.dto');
const { parseExportRequest } = require('../api/dto/exports.dto');
const { parseHistoryQuery } = require('../api/dto/borrowings.dto');
const { parseActivityQuery, toActivityDto } = require('../api/dto/activity.dto');

const validAsset = {
  tag: 'LAP-1001',
  name: ' Dell Latitude ',
  type: 'laptop',
  status: 'AVAILABLE',
  location: 'HQ',
  purchaseDate: '2024-02-14',
};

function fieldsOf(fn) {
  try {
    fn();
  } catch (err) {
    return { status: err.status, code: err.code, fields: err.fields };
  }
  assert.fail('expected a validation error');
}

test('create asset: trims strings, upper-cases codes, defaults notes to null', () => {
  assert.deepEqual(parseCreateAsset(validAsset), {
    tag: 'LAP-1001',
    name: 'Dell Latitude',
    type: 'LAPTOP',
    status: 'AVAILABLE',
    location: 'HQ',
    purchaseDate: '2024-02-14',
    notes: null,
  });
});

test('create asset: reports every bad field at once as a 422', () => {
  const err = fieldsOf(() =>
    parseCreateAsset({ tag: ' ', name: 42, type: 'bad code!', status: 'X', purchaseDate: '2024-02-30', extra: 1 }),
  );
  assert.equal(err.status, 422);
  assert.equal(err.code, 'VALIDATION_FAILED');
  assert.deepEqual(Object.keys(err.fields).sort(), ['extra', 'location', 'name', 'purchaseDate', 'tag', 'type']);
  assert.equal(err.fields.purchaseDate, 'Not a real calendar date');
});

test('create asset: rejects a non-object body with 400', () => {
  const err = fieldsOf(() => parseCreateAsset([validAsset]));
  assert.equal(err.status, 400);
});

test('update asset: tag is optional', () => {
  const { tag, ...rest } = validAsset;
  assert.equal(parseUpdateAsset(rest).tag, undefined);
});

test('list query: defaults, coercion and limits', () => {
  assert.deepEqual(parseListQuery({}), {
    filters: { search: undefined, type: [], typeNot: [], status: [], statusNot: [], location: [], locationNot: [] },
    sort: { key: 'tag', direction: 'asc' },
    page: 1,
    pageSize: 25,
  });
  const q = parseListQuery({ page: '3', pageSize: '50', sort: 'purchaseDate', direction: 'desc', type: 'monitor' });
  assert.equal(q.page, 3);
  assert.equal(q.pageSize, 50);
  assert.deepEqual(q.sort, { key: 'purchaseDate', direction: 'desc' });
  assert.deepEqual(q.filters.type, ['MONITOR']);

  const err = fieldsOf(() => parseListQuery({ page: '0', pageSize: '9999', sort: 'deleted_at' }));
  assert.deepEqual(Object.keys(err.fields).sort(), ['page', 'pageSize', 'sort']);
});

test('list query: repeated keys OR together; exclusions are separate', () => {
  const q = parseListQuery({ type: ['laptop', 'MONITOR', 'laptop'], statusNot: 'retired' });
  assert.deepEqual(q.filters.type, ['LAPTOP', 'MONITOR']);
  assert.deepEqual(q.filters.statusNot, ['RETIRED']);
  const err = fieldsOf(() => parseListQuery({ location: ['HQ', { x: 1 }] }));
  assert.ok(err.fields.location);
});

test('profile input: keeps only included columns, in order', () => {
  const input = parseProfileInput({
    name: 'Monthly',
    dateFormat: 'YYYY-MM-DD',
    columns: [
      { key: 'name', label: 'Asset name', included: true },
      { key: 'tag', label: 'Tag', included: false },
      { key: 'purchaseDate', label: 'Bought', included: true },
    ],
  });
  assert.deepEqual(input.columns, [
    { key: 'name', label: 'Asset name', included: true },
    { key: 'purchaseDate', label: 'Bought', included: true },
  ]);
});

test('profile input: rejects duplicates, unknown keys, and no included column', () => {
  const dup = fieldsOf(() =>
    parseProfileInput({ name: 'x', dateFormat: 'YYYY-MM-DD', columns: [{ key: 'tag', label: 'a' }, { key: 'tag', label: 'b' }] }),
  );
  assert.match(dup.fields['columns[1].key'], /twice/);

  const unknown = fieldsOf(() =>
    parseProfileInput({ name: 'x', dateFormat: 'DD.MM.YYYY', columns: [{ key: 'serial', label: 'S' }] }),
  );
  assert.ok(unknown.fields.dateFormat);
  assert.ok(unknown.fields['columns[0].key']);

  const none = fieldsOf(() =>
    parseProfileInput({ name: 'x', dateFormat: 'YYYY-MM-DD', columns: [{ key: 'tag', label: 'T', included: false }] }),
  );
  assert.equal(none.fields.columns, 'Include at least one column');
});

test('profile dto: appends excluded fields after the stored ones', () => {
  const dto = toProfileDto({
    id: 'p1',
    name: 'Monthly',
    date_format: 'DD/MM/YYYY',
    columns: [{ key: 'purchaseDate', label: 'Bought' }, { key: 'tag', label: null }],
  });
  assert.deepEqual(
    dto.columns.map((c) => [c.key, c.label, c.included]),
    [
      ['purchaseDate', 'Bought', true],
      ['tag', 'Tag', true],
      ['name', 'Name', false],
      ['type', 'Type', false],
      ['status', 'Status', false],
      ['location', 'Location', false],
    ],
  );
});

test('export request: everything optional, defaults to all columns', () => {
  const req = parseExportRequest({});
  assert.equal(req.columns.length, 6);
  assert.equal(req.dateFormat, 'DD/MM/YYYY');
  assert.deepEqual(req.sort, { key: 'tag', direction: 'asc' });
});

test('export request: nested errors are keyed by path', () => {
  const err = fieldsOf(() => parseExportRequest({ filters: { type: '!!', color: 'red' }, sort: { key: 'nope' } }));
  assert.deepEqual(Object.keys(err.fields).sort(), ['filters.color', 'filters.type', 'sort.key']);
});

test('history query: defaults, repeated statuses, trimmed search and limits', () => {
  assert.deepEqual(parseHistoryQuery({}), {
    filters: { status: [], search: undefined, borrowerUserId: undefined },
    sort: { key: 'borrowedAt', direction: 'desc' },
    page: 1,
    pageSize: 25,
  });
  const q = parseHistoryQuery({
    status: ['active', 'RETURNED', 'active'], search: ' laptop ', sort: 'dueAt', direction: 'asc', page: '2', pageSize: '100',
  });
  assert.deepEqual(q.filters, { status: ['ACTIVE', 'RETURNED'], search: 'laptop', borrowerUserId: undefined });
  assert.deepEqual(q.sort, { key: 'dueAt', direction: 'asc' });
  assert.deepEqual([q.page, q.pageSize], [2, 100]);
});

test('history query: names every bad parameter in one 422', () => {
  const err = fieldsOf(() => parseHistoryQuery({
    status: 'FOO', sort: 'deleted_at', direction: 'up', page: '0', pageSize: '101', search: 'x'.repeat(101),
  }));
  assert.equal(err.status, 422);
  assert.deepEqual(Object.keys(err.fields).sort(), ['direction', 'page', 'pageSize', 'search', 'sort', 'status']);
});

test('history query: rejects a NUL character in search and an absurd page number', () => {
  const err = fieldsOf(() => parseHistoryQuery({ search: 'a\u0000b', page: '1000001' }));
  assert.equal(err.status, 422);
  assert.deepEqual(Object.keys(err.fields).sort(), ['page', 'search']);
});

test('history query: borrowerUserId is lower-cased and must be a user id', () => {
  const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
  assert.equal(parseHistoryQuery({ borrowerUserId: id }).filters.borrowerUserId, id.toLowerCase());
  const err = fieldsOf(() => parseHistoryQuery({ borrowerUserId: 'someone' }));
  assert.equal(err.status, 422);
  assert.deepEqual(Object.keys(err.fields), ['borrowerUserId']);
});

test('activity query: action names map to event types; unknown ones and bad paging are 422', () => {
  assert.deepEqual(parseActivityQuery({}), { filters: { eventTypes: [] }, page: 1, pageSize: 25 });
  assert.deepEqual(parseActivityQuery({ action: ['asset_returned', 'ASSET_CREATED'] }).filters.eventTypes, ['returned', 'created']);
  const err = fieldsOf(() => parseActivityQuery({ action: 'ASSET_NOPE', page: '0', pageSize: '101' }));
  assert.deepEqual(Object.keys(err.fields).sort(), ['action', 'page', 'pageSize']);
});

test('activity dto: action label, actor and asset; a system event has no actor', () => {
  const row = {
    id: 'e1', event_type: 'returned', occurred_at: new Date('2026-10-25T12:00:00Z'), description: 'Asset A returned',
    actor_user_id: 'u1', actor_name: 'Minh', asset_id: 'a1', asset_tag: 'A-1', asset_name: 'Laptop',
  };
  assert.deepEqual(toActivityDto(row), {
    id: 'e1', action: 'ASSET_RETURNED', occurredAt: row.occurred_at, description: 'Asset A returned',
    actor: { id: 'u1', displayName: 'Minh' }, asset: { id: 'a1', tag: 'A-1', name: 'Laptop' },
  });
  assert.equal(toActivityDto({ ...row, actor_user_id: null, actor_name: null }).actor, null);
});
