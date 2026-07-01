const db = require("./db/repositories");
const { getStripeClient } = require("./stripe");

// Payment lifecycle (Option B: authorize at checkout, capture on accept):
//   UNPAID     -> order created, customer has not completed checkout
//   AUTHORIZED -> card authorized (held) but not yet charged
//   PAID       -> authorization captured (money taken) when the order is accepted
//   CANCELLED  -> authorization voided (no charge) when the order is declined
const TERMINAL_PAYMENT_STATUSES = ["PAID", "CANCELLED", "REFUNDED"];

// Platform fee (kept by the platform via the Stripe application fee) is the
// LARGER of: $0.20 per item unit, or 3.5% of the order total. Returns cents.
const PER_ITEM_FEE_CENTS = 20;
const PERCENTAGE_FEE_RATE = 0.035;

function calculatePlatformFeeCents(orderItems, totalAmount) {
  const totalUnits = orderItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalCents = Math.round(Number(totalAmount) * 100);

  const perItemFeeCents = PER_ITEM_FEE_CENTS * totalUnits;
  const percentageFeeCents = Math.round(totalCents * PERCENTAGE_FEE_RATE);

  // Never let the fee meet or exceed the charge (Stripe rejects fee >= amount).
  return Math.min(Math.max(perItemFeeCents, percentageFeeCents), Math.max(totalCents - 1, 0));
}

function mapPaymentIntentStatus(piStatus) {
  switch (piStatus) {
    case "requires_capture":
      return "AUTHORIZED";
    case "succeeded":
      return "PAID";
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}

// Resolve the PaymentIntent status for a Checkout Session, then sync the linked
// order's paymentStatus. Idempotent and won't regress a terminal status.
async function applySessionToOrder(session) {
  const orderId = Number(session?.metadata?.orderId);

  if (!Number.isInteger(orderId)) {
    return null;
  }

  const paymentIntent = session.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id || null;
  let paymentIntentStatus =
    paymentIntent && typeof paymentIntent === "object" ? paymentIntent.status : null;

  if (paymentIntentId && !paymentIntentStatus) {
    const retrieved = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
    paymentIntentStatus = retrieved.status;
  }

  const paymentStatus = mapPaymentIntentStatus(paymentIntentStatus);

  if (!paymentStatus) {
    return null;
  }

  const existing = await db.getOrder(orderId);

  if (!existing) {
    return null;
  }

  // Once captured/voided/refunded, leave the order alone (avoid late-webhook regressions).
  if (TERMINAL_PAYMENT_STATUSES.includes(existing.paymentStatus)) {
    return existing;
  }

  return db
    .updateOrder(orderId, {
      paymentStatus,
      stripePaymentIntentId: paymentIntentId,
      stripeSessionId: session.id
    })
    .catch(() => null);
}

// Capture an authorized payment (called when an order is accepted). Returns the
// resulting paymentStatus. No-op for orders without a held authorization
// (e.g. legacy in-store orders that are already PAID).
async function captureOrderPayment(order) {
  if (order.stripePaymentIntentId && order.paymentStatus === "AUTHORIZED") {
    await getStripeClient().paymentIntents.capture(order.stripePaymentIntentId);
    return "PAID";
  }

  return order.paymentStatus;
}

// Void an authorization (called when an order is declined) so the customer is
// never charged. Returns the resulting paymentStatus.
async function voidOrderPayment(order) {
  if (order.stripePaymentIntentId && order.paymentStatus === "AUTHORIZED") {
    await getStripeClient().paymentIntents.cancel(order.stripePaymentIntentId);
    return "CANCELLED";
  }

  return order.paymentStatus;
}

// Express handler for Stripe webhooks. MUST be mounted with a raw body parser
// (express.raw) so the signature can be verified against the exact payload.
async function stripeWebhookHandler(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(400).send("Stripe webhook secret is not configured.");
  }

  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = getStripeClient().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await applySessionToOrder(event.data.object);
    }
  } catch (err) {
    console.error("Error handling Stripe webhook event:", err);
    return res.status(500).send("Webhook handler failed");
  }

  res.json({ received: true });
}

module.exports = {
  applySessionToOrder,
  captureOrderPayment,
  voidOrderPayment,
  calculatePlatformFeeCents,
  stripeWebhookHandler
};
