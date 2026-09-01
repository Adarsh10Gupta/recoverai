const db = require("../db/database");

async function saveEvent({
  eventId,
  eventType,
  payload,
  signature,
  workspaceId,
  razorpayAccountId = null,
}) {
  if (!workspaceId) {
    throw new Error(
      "Cannot save webhook event without workspaceId"
    );
  }

  const result = await db.query(
    `
    INSERT INTO webhook_events (
      razorpay_event_id,
      event_type,
      payload,
      signature,
      status,
      workspace_id,
      razorpay_account_id
    )
    VALUES ($1,$2,$3,$4,'received',$5,$6)
    ON CONFLICT (razorpay_event_id)
    DO NOTHING
    RETURNING *
    `,
    [
      eventId,
      eventType,
      payload,
      signature || null,
      workspaceId,
      razorpayAccountId || null,
    ]
  );

  return result.rows[0] || null;
}


/*
 * Claim exactly one pending event.
 *
 * Workspace is intentionally NOT supplied here because the
 * worker processes events globally. The event itself already
 * contains workspace_id.
 *
 * The UPDATE is atomic and uses SKIP LOCKED so multiple
 * workers cannot process the same event simultaneously.
 */
async function claimNextEvent() {
  const result = await db.query(
    `
    UPDATE webhook_events
    SET
      status = 'processing',
      attempts = attempts + 1
    WHERE id = (
      SELECT id
      FROM webhook_events
      WHERE status IN ('received', 'failed')
        AND attempts < 5
      ORDER BY received_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
    `
  );

  return result.rows[0] || null;
}


async function markProcessed(eventId) {
  await db.query(
    `
    UPDATE webhook_events
    SET
      status = 'processed',
      processed_at = NOW(),
      error_message = NULL
    WHERE razorpay_event_id = $1
    `,
    [eventId]
  );
}


async function markFailed(
  eventId,
  errorMessage,
  retryable = true
) {
  await db.query(
    `
    UPDATE webhook_events
    SET
      status = $2,
      error_message = $3
    WHERE razorpay_event_id = $1
    `,
    [
      eventId,
      retryable ? "failed" : "dead_letter",
      errorMessage,
    ]
  );
}


async function getEvent(eventId) {
  const result = await db.query(
    `
    SELECT *
    FROM webhook_events
    WHERE razorpay_event_id = $1
    `,
    [eventId]
  );

  return result.rows[0] || null;
}


module.exports = {
  saveEvent,
  claimNextEvent,
  markProcessed,
  markFailed,
  getEvent,
};