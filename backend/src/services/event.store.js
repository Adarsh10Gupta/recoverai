const db = require("../db/database");

const saveEvent = async ({
  eventId,
  eventType,
  payload,
  signature,
}) => {
  const result = await db.query(
    `
    INSERT INTO webhook_events (
      razorpay_event_id,
      event_type,
      payload,
      signature,
      status
    )
    VALUES ($1,$2,$3,$4,'received')

    ON CONFLICT (razorpay_event_id)
    DO NOTHING

    RETURNING *
    `,
    [
      eventId,
      eventType,
      payload,
      signature || null,
    ]
  );

  return result.rows[0] || null;
};


const markProcessed = async (eventId) => {
  await db.query(
    `
    UPDATE webhook_events
    SET
      status = 'processed',
      processed_at = NOW()
    WHERE razorpay_event_id = $1
    `,
    [eventId]
  );
};


const markFailed = async (
  eventId,
  errorMessage
) => {
  await db.query(
    `
    UPDATE webhook_events
    SET
      status = 'failed',
      error_message = $2
    WHERE razorpay_event_id = $1
    `,
    [eventId, errorMessage]
  );
};


const getEvent = async (eventId) => {
  const result = await db.query(
    `
    SELECT *
    FROM webhook_events
    WHERE razorpay_event_id = $1
    `,
    [eventId]
  );

  return result.rows[0] || null;
};


module.exports = {
  saveEvent,
  markProcessed,
  markFailed,
  getEvent,
};
