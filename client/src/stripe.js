import { loadStripe } from "@stripe/stripe-js";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Load Stripe.js once and reuse the promise across the app. Null when the
// publishable key is not configured, so callers can degrade gracefully.
export const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export const isStripeConfigured = Boolean(publishableKey);
