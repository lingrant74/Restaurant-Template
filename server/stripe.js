const Stripe = require("stripe");

// Pin to the latest Stripe API version (per Stripe best-practices skill).
const STRIPE_API_VERSION = "2026-05-27.dahlia";

let stripeClient = null;

// Lazily construct the Stripe client so the rest of the app still boots
// (and gives a clear error) when STRIPE_SECRET_KEY is not configured.
function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to .env.");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION
  });

  return stripeClient;
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

module.exports = {
  getStripeClient,
  isStripeConfigured,
  STRIPE_API_VERSION
};
