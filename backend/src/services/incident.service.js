const db = require("../db/database");
const auditService = require("./audit.service");

async function createIncident({
  orderId = null,
  paymentId = null,
  workspaceId,
  type,
  severity = "medium",
  description,
  expectedState = {},
  actualState = {},
}) {
  /*
   * IMPORTANT:
   * Never silently assign an incident to another workspace.
   *
   * RecoverAI is multi-tenant. If workspaceId is missing,
   * we either derive it from the associated order/payment or fail.
   */

  let ws = workspaceId || null;

  if (!ws && orderId) {
    const result = await db.query(
      `
      SELECT workspace_id
      FROM orders
      WHERE id = $1
      LIMIT 1
      `,
      [orderId]
    );

    ws = result.rows[0]?.workspace_id || null;
  }

  if (!ws && paymentId) {
    const result = await db.query(
      `
      SELECT workspace_id
      FROM payments
      WHERE id = $1
      LIMIT 1
      `,
      [paymentId]
    );

    ws = result.rows[0]?.workspace_id || null;
  }

  /*
   * Do NOT fall back to another workspace.
   */
  if (!ws) {
    throw new Error(
      "Cannot create incident without a valid workspace"
    );
  }

  /*
   * Prevent duplicate open incidents for the same
   * workspace + incident type + entity.
   */
  const existing = await db.query(
    `
    SELECT *
    FROM incidents
    WHERE workspace_id = $1
      AND type = $2
      AND status = 'open'
      AND COALESCE(order_id::text, '') =
          COALESCE($3::text, '')
      AND COALESCE(payment_id::text, '') =
          COALESCE($4::text, '')
    ORDER BY detected_at DESC
    LIMIT 1
    `,
    [ws, type, orderId, paymentId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const result = await db.query(
    `
    INSERT INTO incidents (
      order_id,
      payment_id,
      workspace_id,
      type,
      severity,
      description,
      expected_state,
      actual_state
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      orderId,
      paymentId,
      ws,
      type,
      severity,
      description,
      expectedState,
      actualState,
    ]
  );

  const incident = result.rows[0];

  /*
   * Persist the actual detection event.
   * This becomes the first real event in the incident timeline.
   */
  await auditService.log({
    workspaceId: ws,
    entityType: "INCIDENT",
    entityId: incident.id,
    action: "INCIDENT_CREATED",
    actor: "system",
    metadata: {
      incidentId: incident.id,
      type: incident.type,
      severity: incident.severity,
      orderId: incident.order_id,
      paymentId: incident.payment_id,
    },
  });

  return incident;
}

async function listOpenIncidents(workspaceId) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT
      i.*,
      o.merchant_order_id,
      o.razorpay_order_id
    FROM incidents i
    LEFT JOIN orders o
      ON o.id = i.order_id
     AND o.workspace_id = i.workspace_id
    WHERE i.workspace_id = $1
      AND i.status = 'open'
    ORDER BY i.detected_at DESC
    `,
    [workspaceId]
  );

  return result.rows;
}

async function getIncident(id, workspaceId) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    SELECT
      i.*,
      o.merchant_order_id,
      o.razorpay_order_id
    FROM incidents i
    LEFT JOIN orders o
      ON o.id = i.order_id
     AND o.workspace_id = i.workspace_id
    WHERE i.id = $1
      AND i.workspace_id = $2
    `,
    [id, workspaceId]
  );

  return result.rows[0] || null;
}

async function resolveIncident(id, workspaceId) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const result = await db.query(
    `
    UPDATE incidents
    SET
      status = 'resolved',
      resolved_at = NOW()
    WHERE id = $1
      AND workspace_id = $2
    RETURNING *
    `,
    [id, workspaceId]
  );

  const incident = result.rows[0] || null;

  if (incident) {
    await auditService.log({
      workspaceId,
      entityType: "INCIDENT",
      entityId: incident.id,
      action: "INCIDENT_RESOLVED",
      actor: "system",
      metadata: {
        incidentId: incident.id,
        type: incident.type,
      },
    });
  }

  return incident;
}

module.exports = {
  createIncident,
  listOpenIncidents,
  getIncident,
  resolveIncident,
};
