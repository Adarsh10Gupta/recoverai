const razorpayService =
  require("./razorpay.service");

const orderStore =
  require("./order.store");

const paymentStore =
  require("./payment.store");

const incidentService =
  require("./incident.service");

const auditService =
  require("./audit.service");


const reconcileOrder =
  async (merchantOrderId) => {

    const localOrder =
      await orderStore.getOrder(
        merchantOrderId
      );


    if (!localOrder) {
      throw new Error(
        "Local order not found"
      );
    }


    const razorpayOrder =
      await razorpayService.fetchOrder(
        localOrder.razorpayOrderId
      );


    const razorpayPayments =
      await razorpayService
        .fetchOrderPayments(
          localOrder.razorpayOrderId
        );


    const mismatches = [];


    /*
     * Amount
     */

    if (
      Number(razorpayOrder.amount) !==
      Number(localOrder.amountInSubunits)
    ) {
      mismatches.push({
        type:
          "AMOUNT_MISMATCH",

        expected:
          localOrder.amountInSubunits,

        actual:
          razorpayOrder.amount,
      });
    }


    /*
     * Currency
     */

    if (
      razorpayOrder.currency !==
      localOrder.currency
    ) {
      mismatches.push({
        type:
          "CURRENCY_MISMATCH",

        expected:
          localOrder.currency,

        actual:
          razorpayOrder.currency,
      });
    }


    /*
     * Payments
     */

    for (
      const payment of
      razorpayPayments.items || []
    ) {

      await paymentStore.upsertPayment({
        orderId:
          localOrder.id,

        razorpayPaymentId:
          payment.id,

        razorpayOrderId:
          payment.order_id,

        amountInSubunits:
          payment.amount,

        currency:
          payment.currency,

        status:
          payment.status,

        method:
          payment.method,

        email:
          payment.email,

        contact:
          payment.contact,

        errorCode:
          payment.error_code,

        errorDescription:
          payment.error_description,

        capturedAt:
          payment.status ===
          "captured"
            ? new Date()
            : null,
      });


      if (
        Number(payment.amount) !==
        Number(localOrder.amountInSubunits)
      ) {

        mismatches.push({
          type:
            "PAYMENT_AMOUNT_MISMATCH",

          paymentId:
            payment.id,

          expected:
            localOrder.amountInSubunits,

          actual:
            payment.amount,
        });
      }
    }


    /*
     * Local state vs Razorpay state
     */

    if (
      razorpayOrder.status ===
        "paid" &&
      localOrder.status !==
        "paid"
    ) {

      mismatches.push({
        type:
          "LOCAL_STATE_STALE",

        expected:
          "paid",

        actual:
          localOrder.status,
      });
    }


    /*
     * Create incidents
     */

    for (
      const mismatch of mismatches
    ) {

      await incidentService
        .createIncident({
          orderId:
            localOrder.id,

          type:
            mismatch.type,

          severity:
            mismatch.type.includes(
              "AMOUNT"
            )
              ? "critical"
              : "high",

          description:
            `Reconciliation detected ${mismatch.type}.`,

          expectedState:
            {
              localOrder:
                localOrder,
            },

          actualState:
            {
              razorpayOrder,
              mismatch,
            },
        });
    }


    await auditService.log({
      entityType:
        "ORDER",

      entityId:
        localOrder.id,

      action:
        "ORDER_RECONCILED",

      metadata: {
        merchantOrderId,
        razorpayOrderId:
          localOrder.razorpayOrderId,

        mismatchCount:
          mismatches.length,
      },
    });


    return {
      matched:
        mismatches.length === 0,

      merchantOrderId,

      localOrder,

      razorpayOrder,

      razorpayPayments:
        razorpayPayments.items || [],

      mismatches,
    };
  };


module.exports = {
  reconcileOrder,
};
