const db = require("../db/database");

const createIncident = async ({
  orderId = null,
  paymentId = null,
  type,
  severity = "medium",
  description,
  expectedState = {},
  actualState = {},
}) => {
  const result = await db.query(
    `
    INSERT INTO incidents (
      order_id,
      payment_id,
      type,
      severity,
      description,
      expected_state,
      actual_state
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [
      orderId,
      paymentId,
      type,
      severity,
      description,
      expectedState,
      actualState,
    ]
  );

  return result.rows[0];
};


const listOpenIncidents = async () => {
  const result = await db.query(
    `
    SELECT *
    FROM incidents
    WHERE status = 'open'
    ORDER BY detected_at DESC
    `
  );

  return result.rows;
};


const resolveIncident = async (incidentId) => {
  const result = await db.query(
    `
    UPDATE incidents
    SET
      status = 'resolved',
      resolved_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [incidentId]
  );

  return result.rows[0];
};


module.exports = {
  createIncident,
  listOpenIncidents,
  resolveIncident,
};
