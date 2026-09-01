const Razorpay = require("razorpay");
const config = require("../config/env");

const razorpay = config.razorpayKeyId && config.razorpayKeySecret
  ? new Razorpay({ key_id: config.razorpayKeyId, key_secret: config.razorpayKeySecret })
  : null;

async function oauthRequest(accessToken, path) {
  const response = await fetch(`https://api.razorpay.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.description || body.error || `Razorpay API failed (${response.status})`);
  return body;
}

async function createOrder({ amount, currency = "INR", receipt, accessToken }) {
  if (accessToken) {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency, receipt }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.description || body.error || "Razorpay order creation failed");
    return body;
  }
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.orders.create({ amount, currency, receipt });
}

async function fetchOrder(orderId, accessToken) {
  if (accessToken) return oauthRequest(accessToken, `/v1/orders/${encodeURIComponent(orderId)}`);
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.orders.fetch(orderId);
}

async function fetchOrderPayments(orderId, accessToken) {
  if (accessToken) return oauthRequest(accessToken, `/v1/orders/${encodeURIComponent(orderId)}/payments`);
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.orders.fetchPayments(orderId);
}

async function createPaymentLink({ amount, currency = "INR", referenceId, description, expireBy, customer = {}, notes = {}, accessToken }) {
  const body = {
    amount,
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description,
    expire_by: expireBy,
    ...(Object.keys(customer || {}).length ? { customer } : {}),
    notes,
    reminder_enable: false,
  };
  if (accessToken) {
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.description || result.error || "Razorpay payment link creation failed");
    return result;
  }
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.paymentLink.create(body);
}

async function fetchPaymentLink(id, accessToken) {
  if (accessToken) return oauthRequest(accessToken, `/v1/payment_links/${encodeURIComponent(id)}`);
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.paymentLink.fetch(id);
}

async function fetchPayment(paymentId, accessToken) {
  if (accessToken) return oauthRequest(accessToken, `/v1/payments/${encodeURIComponent(paymentId)}`);
  if (!razorpay) throw new Error("Razorpay API credentials are not configured");
  return razorpay.payments.fetch(paymentId);
}

module.exports = { createOrder, fetchOrder, fetchOrderPayments, fetchPayment, createPaymentLink, fetchPaymentLink };
