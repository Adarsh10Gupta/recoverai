const BACKEND_URL = import.meta.env.VITE_API_URL;

const payButton = document.getElementById("pay-button");
const statusElement = document.getElementById("status");

const API_URL = import.meta.env.VITE_API_URL;

payButton.addEventListener("click", async () => {
  try {
    payButton.disabled = true;
    statusElement.textContent = "Creating order...";

    console.log(
      "Calling backend:",
      `${BACKEND_URL}/api/orders`
    );

    const response = await fetch(`${BACKEND_URL}/api/orders`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        amount: 4999,
        currency: "INR"
    })
});

    const responseText = await response.text();

    console.log("Backend HTTP status:", response.status);
    console.log("Backend response:", responseText);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new Error(
        `Backend returned invalid JSON: ${responseText}`
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
          `Backend request failed with status ${response.status}`
      );
    }

    const order = data.order;

    statusElement.textContent =
      "Opening Razorpay Checkout...";

    const options = {
      key: "rzp_test_TSWZCi3dGR5e2Y",

      amount: order.amountInSubunits,

      currency: order.currency,

      name: "RecoverAI Demo Store",

      description: "AI Engineering Course",

      order_id: order.id,

      handler: async function (response) {
        console.log("Payment successful:", response);

        statusElement.textContent =
          "Payment successful. Verifying...";

        try {
          const verifyResponse = await fetch(
            `${BACKEND_URL}/api/orders/verify`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                merchantOrderId: order.merchantOrderId,
                razorpay_payment_id:
                  response.razorpay_payment_id,
                razorpay_signature:
                  response.razorpay_signature,
              }),
            }
          );

          const verifyData = await verifyResponse.json();

          console.log(
            "Verification response:",
            verifyData
          );

          if (
            !verifyResponse.ok ||
            !verifyData.verified
          ) {
            throw new Error(
              verifyData.message ||
                "Payment verification failed"
            );
          }

          statusElement.textContent =
            "✓ Payment verified successfully!";
        } catch (error) {
          console.error(
            "Verification error:",
            error
          );

          statusElement.textContent =
            `Payment verification failed: ${error.message}`;
        }
      },

      modal: {
        ondismiss: function () {
          console.log(
            "Razorpay Checkout dismissed"
          );

          statusElement.textContent =
            "Payment window closed.";

          payButton.disabled = false;
        },
      },

      theme: {
        color: "#111827",
      },
    };

    const razorpay = new Razorpay(options);

    razorpay.open();
  } catch (error) {
    console.error("Payment initialization failed:", error);

    statusElement.textContent =
      `Payment initialization failed: ${error.message}`;

    payButton.disabled = false;
  }
});

