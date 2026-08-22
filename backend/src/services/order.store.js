const orders = new Map();

const saveOrder = (order) => {
  orders.set(order.merchantOrderId, order);

  return order;
};

const getOrder = (merchantOrderId) => {
  return orders.get(merchantOrderId);
};

const getOrderByRazorpayOrderId = (razorpayOrderId) => {
  return Array.from(orders.values()).find(
    (order) =>
      order.razorpayOrderId === razorpayOrderId
  );
};

module.exports = {
  saveOrder,
  getOrder,
  getOrderByRazorpayOrderId,
};
