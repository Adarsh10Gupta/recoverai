const reconciliationService = require("../services/reconciliation.service");
const orderStore = require("../services/order.store");
const recoveryService = require("../services/recovery.service");
const db = require("../db/database");

async function reconcile(req, res) {
  try {
    const workspaceId = req.auth.workspaceId;

    const order = await orderStore.getOrder(
      req.params.merchantOrderId,
      workspaceId
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      ...(await reconciliationService.reconcileOrder(
        req.params.merchantOrderId,
        workspaceId
      )),
    });
  } catch (e) {
    return res.status(404).json({
      success: false,
      message: e.message,
    });
  }
}

async function recover(req, res) {
  try {
    const workspaceId = req.auth.workspaceId;

    const order = await orderStore.getOrder(
      req.params.merchantOrderId,
      workspaceId
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const r = await db.query(
      `
      SELECT id
      FROM incidents
      WHERE order_id = $1
        AND workspace_id = $2
        AND status = 'open'
      ORDER BY detected_at DESC
      LIMIT 1
      `,
      [order.id, workspaceId]
    );

    if (!r.rows[0]) {
      return res.json({
        success: true,
        message: "No open incident found for this order.",
      });
    }

    return res.json(
      await recoveryService.recoverIncident(
        r.rows[0].id,
        workspaceId
      )
    );
  } catch (e) {
    console.error("Recovery failed:", e);

    return res.status(500).json({
      success: false,
      message: e.message,
    });
  }
}

module.exports = {
  reconcile,
  recover,
};
