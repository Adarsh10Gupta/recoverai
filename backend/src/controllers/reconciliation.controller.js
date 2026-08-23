const reconciliationService =
  require("../services/reconciliation.service");

const orderStore =
  require("../services/order.store");

const recoveryService =
  require("../services/recovery.service");

const db =
  require("../db/database");


const reconcile = async (
  req,
  res
) => {

  try {

    const result =
      await reconciliationService
        .reconcileOrder(
          req.params.merchantOrderId
        );


    return res.json({
      success: true,
      ...result,
    });

  } catch (error) {

    console.error(
      "Reconciliation failed:",
      error
    );


    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};


const recover =
  async (req, res) => {

    try {

      const order =
        await orderStore.getOrder(
          req.params.merchantOrderId
        );


      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }


      const incidentResult =
        await db.query(
          `
          SELECT id
          FROM incidents
          WHERE order_id = $1
          AND status = 'open'
          ORDER BY detected_at DESC
          LIMIT 1
          `,
          [order.id]
        );


      if (
        incidentResult.rowCount === 0
      ) {

        return res.json({
          success: true,

          message:
            "No open incident found for this order.",
        });
      }


      const result =
        await recoveryService
          .recoverIncident(
            incidentResult.rows[0].id
          );


      return res.json(result);

    } catch (error) {

      console.error(
        "Recovery failed:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };


module.exports = {
  reconcile,
  recover,
};
