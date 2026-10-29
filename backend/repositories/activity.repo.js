/**
 * Read side of the append-only `asset_events` timeline (US-11-T5). Archived assets are not filtered out:
 * their history must stay visible. Events are written by the repositories that make the change
 * (assetEvents.repo.js), in the same transaction.
 */

const db = require('../db/pool');

/** One page, newest first, plus the total match count (ADR-0003). */
async function listActivity({ filters, page, pageSize }) {
  const params = [];
  let where = '';
  if (filters.eventTypes.length) {
    params.push(filters.eventTypes);
    where = 'WHERE e.event_type::text = ANY($1)';
  }
  const offset = (page - 1) * pageSize;

  const [countResult, pageResult] = await Promise.all([
    db.query(`SELECT count(*)::int AS total FROM asset_events e ${where}`, params),
    db.query(
      `SELECT e.id, e.event_type::text AS event_type, e.occurred_at, e.description,
              e.actor_user_id, u.display_name AS actor_name,
              e.asset_id, a.asset_tag::text AS asset_tag, a.name AS asset_name
         FROM asset_events e
         JOIN assets a ON a.id = e.asset_id
         LEFT JOIN fw_users u ON u.id = e.actor_user_id
       ${where}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
  ]);

  return { items: pageResult.rows, total: countResult.rows[0].total, page, pageSize };
}

module.exports = { listActivity };
