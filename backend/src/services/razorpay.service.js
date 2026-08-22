const Razorpay = require("razorpay");
const config = require("../config/env");

const razorpay = new Razorpay({
  key_id: config.razorpayKeyId,
  key_secret: config.razorpayKeySecret,
});

const createOrder = async ({ amount, currency = "INR", receipt }) => {
  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt,
  });

  return order;
};

module.exports = {
  createOrder,
};
