/**
 * Borrowing DTOs (ADR-0005). A borrowing record is a row of `asset_loans`
 * joined with its asset and the people involved. The history endpoint
 * serves both the "active borrowings" and the "history" views, so the
 * filter, not a second endpoint, tells them apart.
 */

const { checkQuery } = require('../validation');

/** Values of the database-generated `asset_loans.status` column. */
const STATUSES = ['ACTIVE', 'RETURNED', 'OVERDUE_RETURNED'];
const SORT_KEYS = ['borrowedAt', 'dueAt', 'returnedAt', 'borrower', 'asset'];
const SORT_DIRECTIONS = ['asc', 'desc'];

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
// Keeps OFFSET far inside bigint range; a larger value would be a 500 from Postgres, not a 422.
const MAX_PAGE = 1_000_000;
const MAX_SEARCH_LENGTH = 100;

function readStatuses(c) {
  const statuses = c.codes('status');
  if (statuses === undefined) return undefined;
  const unknown = statuses.find((status) => !STATUSES.includes(status));
  return unknown ? c.fail('status', `Unknown status "${unknown}"; use ${STATUSES.join(', ')}`) : statuses;
}

/**
 * GET /api/borrowings/history query (ADR-0003): page, pageSize, sort,
 * direction, plus
 *
 *   status=A&status=B   record status is A or B (omitted: every record)
 *   search=…            asset tag, asset name or borrower contains the text
 */
function parseHistoryQuery(query) {
  const c = checkQuery(query);
  return c.done({
    filters: {
      status: readStatuses(c),
      search: c.string('search', { required: false, max: MAX_SEARCH_LENGTH }),
    },
    sort: {
      key: c.oneOf('sort', SORT_KEYS, { required: false, fallback: 'borrowedAt' }),
      direction: c.oneOf('direction', SORT_DIRECTIONS, { required: false, fallback: 'desc' }),
    },
    page: c.integer('page', { min: 1, max: MAX_PAGE, fallback: 1 }),
    pageSize: c.integer('pageSize', { min: 1, max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  });
}

/** Staff appear by display name only; e-mail addresses are not part of the history. */
function person(id, displayName) {
  return id ? { id, displayName } : null;
}

function toBorrowingDto(row) {
  return {
    id: row.id,
    status: row.loan_status,
    isOverdue: row.is_overdue,
    borrowerName: row.borrower_name,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    note: row.note,
    asset: {
      id: row.asset_id,
      tag: row.asset_tag,
      name: row.asset_name,
      type: row.type_code,
      typeName: row.type_name,
      status: row.asset_status,
      statusName: row.asset_status_name,
      archived: row.asset_archived,
    },
    createdBy: person(row.created_by_user_id, row.created_by_name),
    returnedBy: person(row.returned_by_user_id, row.returned_by_name),
  };
}

module.exports = {
  STATUSES,
  SORT_KEYS,
  SORT_DIRECTIONS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PAGE,
  parseHistoryQuery,
  toBorrowingDto,
};
