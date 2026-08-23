const crypto = require("crypto");

const config =
  require("../config/env");

const db =
  require("../db/database");

const eventStore =
  require("./event.store");

const auditService =
  require("./audit.service");

const incidentService =
  require("./incident.service");


const verifyWebhookSignature = (
  rawBody,
  receivedSignature
) => {

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        config.razorpayWebhookSecret
      )
      .update(rawBody)
      .digest("hex");


  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      receivedSignature || "",
      "utf8"
    );


  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }


  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
};


const processWebhook = async ({
  eventId,
  rawBody,
  signature,
}) => {

  const rawText =
    rawBody.toString("utf8");

  const payload =
    JSON.parse(rawText);

  const eventType =
    payload.event;


  const client =
    await db.getClient();


  try {

    await client.query("BEGIN");


    /*
     * Atomic idempotency check.
     *
     * If Razorpay retries the exact same
     * event, only one request can insert it.
     */
    const eventResult =
      await client.query(
        `
        INSERT INTO webhook_events (
          razorpay_event_id,
          event_type,
          payload,
          signature,
          status
        )
        VALUES ($1,$2,$3,$4,'received')

        ON CONFLICT (
          razorpay_event_id
        )
        DO NOTHING

        RETURNING id
        `,
        [
          eventId,
          eventType,
          payload,
          signature,
        ]
      );


    if (
      eventResult.rowCount === 0
    ) {

      await client.query(
        "ROLLBACK"
      );

      return {
        duplicate: true,
        eventId,
        eventType,
      };
    }


    /*
     * PAYMENT EVENTS
     */

    if (
      eventType ===
      "payment.authorized" ||
      eventType ===
      "payment.captured" ||
      eventType ===
      "payment.failed"
    ) {

      const payment =
        payload.payload
          ?.payment
          ?.entity;


      if (payment) {

        const razorpayOrderId =
          payment.order_id;


        const orderResult =
          await client.query(
            `
            SELECT *
            FROM orders
            WHERE razorpay_order_id = $1
            FOR UPDATE
            `,
            [razorpayOrderId]
          );


        const order =
          orderResult.rows[0];


        if (!order) {

          await client.query(
            `
            UPDATE webhook_events
            SET
              status = 'processed',
              processed_at = NOW()
            WHERE razorpay_event_id = $1
            `,
            [eventId]
          );


          await client.query(
            "COMMIT"
          );


          await incidentService.createIncident({
            type:
              "PAYMENT_WITHOUT_ORDER",

            severity:
              "critical",

            description:
              "Razorpay payment webhook received but the corresponding local order was not found.",

            expectedState: {
              razorpayOrderId,
            },

            actualState: {
              paymentId:
                payment.id,
              amount:
                payment.amount,
            },
          });


          return {
            duplicate: false,
            eventId,
            eventType,
            incident:
              "PAYMENT_WITHOUT_ORDER",
          };
        }


        /*
         * Store / update payment
         */

        const paymentResult =
          await client.query(
            `
            INSERT INTO payments (
              order_id,
              razorpay_payment_id,
              razorpay_order_id,
              amount_in_subunits,
              currency,
              status,
              method,
              email,
              contact,
              error_code,
              error_description,
              captured_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )

            ON CONFLICT (
              razorpay_payment_id
            )
            DO UPDATE SET
              status = EXCLUDED.status,
              method = EXCLUDED.method,
              email = EXCLUDED.email,
              contact = EXCLUDED.contact,
              error_code = EXCLUDED.error_code,
              error_description =
                EXCLUDED.error_description,
              captured_at =
                COALESCE(
                  EXCLUDED.captured_at,
                  payments.captured_at
                ),
              updated_at = NOW()

            RETURNING id
            `,
            [
              order.id,

              payment.id,

              payment.order_id,

              payment.amount,

              payment.currency,

              payment.status,

              payment.method,

              payment.email,

              payment.contact,

              payment.error_code,

              payment.error_description,

              payment.status ===
              "captured"
                ? new Date()
                : null,
            ]
          );


        /*
         * Detect amount mismatch
         */

        if (
          Number(payment.amount) !==
          Number(order.amount_in_subunits)
        ) {

          await client.query(
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
            VALUES (
              $1,$2,
              'AMOUNT_MISMATCH',
              'critical',
              $3,$4,$5
            )
            `,
            [
              order.id,

              paymentResult.rows[0].id,

              "Payment amount does not match local order amount.",

              {
                amountInSubunits:
                  Number(
                    order.amount_in_subunits
                  ),
              },

              {
                amountInSubunits:
                  Number(
                    payment.amount
                  ),
              },
            ]
          );
        }


        /*
         * Detect currency mismatch
         */

        if (
          payment.currency !==
          order.currency
        ) {

          await client.query(
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
            VALUES (
              $1,$2,
              'CURRENCY_MISMATCH',
              'critical',
              $3,$4,$5
            )
            `,
            [
              order.id,

              paymentResult.rows[0].id,

              "Payment currency does not match local order currency.",

              {
                currency:
                  order.currency,
              },

              {
                currency:
                  payment.currency,
              },
            ]
          );
        }


        /*
         * Never downgrade a payment.
         */

        const currentStatus =
          order.status;


        let nextStatus =
          currentStatus;


        if (
          eventType ===
          "payment.captured"
        ) {

          if (
            currentStatus !==
              "paid"
          ) {
            nextStatus =
              "captured";
          }

        } else if (
          eventType ===
          "payment.failed"
        ) {

          if (
            currentStatus !==
              "captured" &&
            currentStatus !==
              "paid"
          ) {
            nextStatus =
              "failed";
          }

        } else if (
          eventType ===
          "payment.authorized"
        ) {

          if (
            currentStatus !==
              "captured" &&
            currentStatus !==
              "paid"
          ) {
            nextStatus =
              "authorized";
          }
        }


        await client.query(
          `
          UPDATE orders
          SET
            status = $2,

            captured_at =
              CASE
                WHEN $2 = 'captured'
                THEN COALESCE(
                  captured_at,
                  NOW()
                )
                ELSE captured_at
              END,

            updated_at = NOW()

          WHERE id = $1
          `,
          [
            order.id,
            nextStatus,
          ]
        );
      }
    }


    /*
     * ORDER PAID
     */

    if (
      eventType ===
      "order.paid"
    ) {

      const razorpayOrder =
        payload.payload
          ?.order
          ?.entity;


      if (razorpayOrder) {

        const orderResult =
          await client.query(
            `
            SELECT *
            FROM orders
            WHERE razorpay_order_id = $1
            FOR UPDATE
            `,
            [
              razorpayOrder.id,
            ]
          );


        const order =
          orderResult.rows[0];


        if (order) {

          if (
            Number(
              razorpayOrder.amount
            ) !==
            Number(
              order.amount_in_subunits
            )
          ) {

            await client.query(
              `
              INSERT INTO incidents (
                order_id,
                type,
                severity,
                description,
                expected_state,
                actual_state
              )
              VALUES (
                $1,
                'AMOUNT_MISMATCH',
                'critical',
                $2,
                $3,
                $4
              )
              `,
              [
                order.id,

                "Razorpay order amount does not match local order amount.",

                {
                  amountInSubunits:
                    Number(
                      order.amount_in_subunits
                    ),
                },

                {
                  amountInSubunits:
                    Number(
                      razorpayOrder.amount
                    ),
                },
              ]
            );
          }


          await client.query(
            `
            UPDATE orders
            SET
              status = 'paid',
              paid_at =
                COALESCE(
                  paid_at,
                  NOW()
                ),
              updated_at = NOW()
            WHERE id = $1
            `,
            [order.id]
          );
        }
      }
    }


    /*
     * Mark event processed.
     */

    await client.query(
      `
      UPDATE webhook_events
      SET
        status = 'processed',
        processed_at = NOW()
      WHERE razorpay_event_id = $1
      `,
      [eventId]
    );


    await client.query(
      "COMMIT"
    );


    await auditService.log({
      entityType:
        "WEBHOOK",

      entityId:
        eventId,

      action:
        "WEBHOOK_PROCESSED",

      metadata: {
        eventType,
      },
    });


    return {
      duplicate: false,
      eventId,
      eventType,
    };

  } catch (error) {

    await client.query(
      "ROLLBACK"
    );


    try {
      await eventStore.markFailed(
        eventId,
        error.message
      );
    } catch (_) {
      // Preserve original error.
    }


    throw error;

  } finally {

    client.release();
  }
};


module.exports = {
  verifyWebhookSignature,
  processWebhook,
};
