/**
 * Activity log DTOs (ADR-0005): the asset timeline (`asset_events`) as a read-only list. The action names
 * are the event types in the form the log shows (`returned` -> ASSET_RETURNED).
 */

const { checkQuery } = require('../validation');
const { readPaging } = require('./paging');

const ACTION_BY_EVENT_TYPE = {
  created: 'ASSET_CREATED',
  updated: 'ASSET_UPDATED',
  archived: 'ASSET_ARCHIVED',
  restored: 'ASSET_RESTORED',
  loaned: 'ASSET_LOANED',
  returned: 'ASSET_RETURNED',
};
const ACTIONS = Object.values(ACTION_BY_EVENT_TYPE);
const EVENT_TYPE_BY_ACTION = Object.fromEntries(Object.entries(ACTION_BY_EVENT_TYPE).map(([type, action]) => [action, type]));

function readEventTypes(c) {
  const actions = c.codes('action');
  if (actions === undefined) return undefined;
  const unknown = actions.find((action) => !ACTIONS.includes(action));
  return unknown
    ? c.fail('action', `Unknown action "${unknown}"; use ${ACTIONS.join(', ')}`)
    : actions.map((action) => EVENT_TYPE_BY_ACTION[action]);
}

/** GET /api/activity query: page, pageSize and `action=A&action=B` (omitted: every action). */
function parseActivityQuery(query) {
  const c = checkQuery(query);
  return c.done({ filters: { eventTypes: readEventTypes(c) }, ...readPaging(c) });
}

/** The actor is shown by display name only; a system event has none. */
function toActivityDto(row) {
  return {
    id: row.id,
    action: ACTION_BY_EVENT_TYPE[row.event_type] || row.event_type,
    occurredAt: row.occurred_at,
    description: row.description,
    actor: row.actor_user_id ? { id: row.actor_user_id, displayName: row.actor_name } : null,
    asset: { id: row.asset_id, tag: row.asset_tag, name: row.asset_name },
  };
}

module.exports = { ACTIONS, parseActivityQuery, toActivityDto };
