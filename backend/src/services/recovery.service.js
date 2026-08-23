const db =
  require("../db/database");

const reconciliationService =
  require("./reconciliation.service");

const auditService =
  require("./audit.service");


const recoverIncident =
  async (incidentId) => {

    const result =
      await db.query(
        `
        SELECT *
        FROM incidents
        WHERE id = $1
        `,
        [incidentId]
      );


    const incident =
      result.rows[0];


    if (!incident) {
      throw new Error(
        "Incident not found"
      );
    }


    const actionResult =
      await db.query(
        `
        INSERT INTO recovery_actions (
          incident_id,
          action_type,
          status,
          attempt
        )
        VALUES (
          $1,
          'RECONCILE_ORDER',
          'running',
          1
        )
        RETURNING *
        `,
        [incidentId]
      );


    const action =
      actionResult.rows[0];


    try {

      const orderResult =
        await db.query(
          `
          SELECT *
          FROM orders
          WHERE id = $1
          `,
          [incident.order_id]
        );


      const order =
        orderResult.rows[0];


      if (!order) {
        throw new Error(
          "Order associated with incident not found"
        );
      }


      const reconciliation =
        await reconciliationService
          .reconcileOrder(
            order.merchant_order_id
          );


      await db.query(
        `
        UPDATE recovery_actions
        SET
          status = 'completed',
          result = $2,
          completed_at = NOW()
        WHERE id = $1
        `,
        [
          action.id,
          reconciliation,
        ]
      );


      if (
        reconciliation.matched
      ) {

        await db.query(
          `
          UPDATE incidents
          SET
            status = 'resolved',
            resolved_at = NOW()
          WHERE id = $1
          `,
          [incidentId]
        );
      }


      await auditService.log({
        entityType:
          "INCIDENT",

        entityId:
          incidentId,

        action:
          "RECOVERY_COMPLETED",

        metadata: {
          recoveryActionId:
            action.id,

          matched:
            reconciliation.matched,
        },
      });


      return {
        success: true,

        incidentId,

        recoveryActionId:
          action.id,

        reconciliation,
      };

    } catch (error) {

      await db.query(
        `
        UPDATE recovery_actions
        SET
          status = 'failed',
          error = $2,
          completed_at = NOW()
        WHERE id = $1
        `,
        [
          action.id,
          error.message,
        ]
      );


      throw error;
    }
  };


module.exports = {
  recoverIncident,
};
