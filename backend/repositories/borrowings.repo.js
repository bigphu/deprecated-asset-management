/**
 * Borrowing persistence (US-11, US-12) over `asset_loans`. Returning a loan
 * changes the loan, the asset's status and the asset timeline in one
 * transaction. Archived (soft-deleted) assets are deliberately not filtered
 * out: their borrowing history must not vanish.
 */

const db = require('../db/pool');
const { ApiError } = require('../api/errors');
const { recordEvent } = require('./assetEvents.repo');
const { escapeLike } = require('./sql');

// `l.status` (the loan's generated status) and `s.code` (the asset's status)
// share a column name, hence the distinct aliases.
const SELECT_BORROWING = `
  SELECT l.id,
         l.status AS loan_status,
         (l.returned_at IS NULL AND l.due_at IS NOT NULL AND l.due_at < now()) AS is_overdue,
         l.borrower_name, l.borrower_user_id, l.borrowed_at, l.due_at, l.returned_at, l.note,
         l.asset_id,
         a.asset_tag::text AS asset_tag,
         a.name AS asset_name,
         a.deleted_at IS NOT NULL AS asset_archived,
         t.code AS type_code, t.name AS type_name,
         s.code AS asset_status, s.name AS asset_status_name,
         l.created_by_user_id,  cu.display_name AS created_by_name,
         l.returned_by_user_id, ru.display_name AS returned_by_name
    FROM asset_loans l
    JOIN assets         a ON a.id = l.asset_id
    JOIN asset_types    t ON t.id = a.asset_type_id
    JOIN asset_statuses s ON s.id = a.asset_status_id
    JOIN fw_users      cu ON cu.id = l.created_by_user_id
    LEFT JOIN fw_users ru ON ru.id = l.returned_by_user_id`;

// Whitelist: sort keys map to SQL here and nowhere else, so user input never reaches ORDER BY.
const ORDER_COLUMNS = {
  borrowedAt: 'l.borrowed_at',
  dueAt: 'l.due_at',
  returnedAt: 'l.returned_at',
  borrower: 'l.borrower_name',
  asset: 'a.asset_tag',
};

function buildWhere({ status = [], search, borrowerUserId } = {}) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replaceAll('?', '$' + params.length));
  };

  if (status.length) add('l.status = ANY(?)', status);
  if (borrowerUserId) add('l.borrower_user_id = ?', borrowerUserId);
  if (search) add('(a.asset_tag ILIKE ? OR a.name ILIKE ? OR l.borrower_name ILIKE ?)', '%' + escapeLike(search) + '%');

  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

/** Records without a value (no due date yet, not returned) sort last in both directions; id keeps paging stable. */
function buildOrderBy(sort = {}) {
  const column = ORDER_COLUMNS[sort.key] || ORDER_COLUMNS.borrowedAt;
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${column} ${direction} NULLS LAST, l.id ASC`;
}

/** One page plus the total match count (ADR-0003). */
async function listBorrowingHistory({ filters, sort, page, pageSize }) {
  const { where, params } = buildWhere(filters);
  const offset = (page - 1) * pageSize;

  const [countResult, pageResult] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS total
         FROM asset_loans l
         JOIN assets a ON a.id = l.asset_id
       ${where}`,
      params,
    ),
    db.query(
      `${SELECT_BORROWING} ${where} ${buildOrderBy(sort)}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
  ]);

  return { items: pageResult.rows, total: countResult.rows[0].total, page, pageSize };
}

async function findBorrowing(id, client = db) {
  const { rows } = await client.query(`${SELECT_BORROWING} WHERE l.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Records that the borrowed asset came back. The row lock makes a second,
 * simultaneous return wait and then fail with 409 instead of overwriting the
 * first one's time and actor. The asset only leaves ON_LOAN: any other status
 * (for example RETIRED) is a decision someone made and is left alone.
 */
async function returnBorrowing(id, userId) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT l.returned_at, l.asset_id, a.asset_tag::text AS asset_tag
         FROM asset_loans l
         JOIN assets a ON a.id = l.asset_id
        WHERE l.id = $1
          FOR UPDATE OF l`,
      [id],
    );
    const loan = rows[0];
    if (!loan) throw new ApiError(404, 'NOT_FOUND', 'Borrowing record not found');
    if (loan.returned_at) throw new ApiError(409, 'ALREADY_RETURNED', 'This asset has already been returned');

    await client.query(
      'UPDATE asset_loans SET returned_at = now(), returned_by_user_id = $2 WHERE id = $1',
      [id, userId],
    );
    await client.query(
      `UPDATE assets
          SET asset_status_id = (SELECT id FROM asset_statuses WHERE code = 'AVAILABLE'),
              updated_by_user_id = $2
        WHERE id = $1
          AND asset_status_id = (SELECT id FROM asset_statuses WHERE code = 'ON_LOAN')`,
      [loan.asset_id, userId],
    );
    // No borrower name here: the timeline is append-only and not limited to borrowings.view,
    // so a name written once could never be corrected. The loan id links to it.
    await recordEvent(client, loan.asset_id, 'returned', userId, `Asset ${loan.asset_tag} returned`, { loanId: id });

    return findBorrowing(id, client);
  });
}

module.exports = { listBorrowingHistory, findBorrowing, returnBorrowing };
