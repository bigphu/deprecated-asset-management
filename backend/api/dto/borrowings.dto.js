/**
 * Borrowing DTOs (ADR-0005). A borrowing record is a row of `asset_loans`
 * joined with its asset and the people involved. The history endpoint
 * serves both the "active borrowings" and the "history" views, so the
 * filter, not a second endpoint, tells them apart.
 */

const { checkQuery } = require('../validation');
const { readPaging } = require('./paging');

/** Values of the database-generated `asset_loans.status` column. */
const STATUSES = ['ACTIVE', 'RETURNED', 'OVERDUE_RETURNED'];
const SORT_KEYS = ['borrowedAt', 'dueAt', 'returnedAt', 'borrower', 'asset'];
const SORT_DIRECTIONS = ['asc', 'desc'];

const MAX_SEARCH_LENGTH = 100;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 *   borrowerUserId=…    only records of that user (a borrower may only name themselves)
 */
function parseHistoryQuery(query) {
  const c = checkQuery(query);
  return c.done({
    filters: {
      status: readStatuses(c),
      search: c.string('search', { required: false, max: MAX_SEARCH_LENGTH }),
      // Compared with session user ids, which are lower case.
      borrowerUserId: c
        .string('borrowerUserId', { required: false, max: 36, pattern: USER_ID, patternMessage: 'Must be a user id' })
        ?.toLowerCase(),
    },
    sort: {
      key: c.oneOf('sort', SORT_KEYS, { required: false, fallback: 'borrowedAt' }),
      direction: c.oneOf('direction', SORT_DIRECTIONS, { required: false, fallback: 'desc' }),
    },
    ...readPaging(c),
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
    borrowerUserId: row.borrower_user_id,
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
  parseHistoryQuery,
  toBorrowingDto,
};
