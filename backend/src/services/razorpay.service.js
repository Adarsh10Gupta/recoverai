const Razorpay = require("razorpay");
const config = require("../config/env");

const razorpay = new Razorpay({
  key_id: config.razorpayKeyId,
  key_secret: config.razorpayKeySecret,
});


const createOrder = async ({
  amount,
  currency = "INR",
  receipt,
}) => {
  return razorpay.orders.create({
    amount,
    currency,
    receipt,
  });
};


const fetchOrder = async (
  razorpayOrderId
) => {
  return razorpay.orders.fetch(
    razorpayOrderId
  );
};


const fetchPayment = async (
  razorpayPaymentId
) => {
  return razorpay.payments.fetch(
    razorpayPaymentId
  );
};


const fetchOrderPayments = async (
  razorpayOrderId
) => {
  return razorpay.orders.fetchPayments(
    razorpayOrderId
  );
};


module.exports = {
  createOrder,
  fetchOrder,
  fetchPayment,
  fetchOrderPayments,
};
