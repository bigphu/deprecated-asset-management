/**
 * The append-only `asset_events` timeline. Callers pass the client of the
 * transaction that makes the change, so an event commits (or rolls back)
 * together with what it describes.
 */

function recordEvent(client, assetId, eventType, userId, description, details = {}) {
  return client.query(
    `INSERT INTO asset_events (asset_id, event_type, actor_user_id, description, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [assetId, eventType, userId, description, JSON.stringify(details)],
  );
}

module.exports = { recordEvent };
