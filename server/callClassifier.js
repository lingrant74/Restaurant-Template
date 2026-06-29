// Rules-based classifier to distinguish customer orders from automated
// confirmation calls (DoorDash, Uber Eats, Grubhub, Toast, etc).

const CONFIRMATION_PHRASES = [
  "press 1",
  "press 2",
  "press any key",
  "confirm this order",
  "confirm the order",
  "accept this order",
  "accept the order",
  "new order from",
  "order confirmation",
  "confirm or reject",
  "confirm or decline",
  "press star",
  "press pound",
  "automated call",
  "this is a confirmation",
  "to accept",
  "to reject",
  "to decline",
];

const PLATFORMS = [
  { name: "DoorDash", keywords: ["doordash", "door dash"] },
  { name: "Uber Eats", keywords: ["uber eats", "uber"] },
  { name: "Grubhub", keywords: ["grubhub", "grub hub"] },
  { name: "Toast", keywords: ["toast tab", "toast pos", "toasttab"] },
  { name: "Postmates", keywords: ["postmates"] },
  { name: "Caviar", keywords: ["caviar"] },
];

const CUSTOMER_PHRASES = [
  "i want",
  "i'd like",
  "id like",
  "i would like",
  "can i get",
  "can i have",
  "could i get",
  "give me",
  "i need",
  "i'll have",
  "ill have",
  "do you have",
  "how much",
  "what sizes",
  "what's on",
  "whats on",
  "what comes on",
  "is the",
  "are you open",
  "your menu",
  "place an order",
  "to order",
];

function detectCallType({ speechResult, digits, from }) {
  const text = (speechResult || "").toLowerCase().trim();
  const reasons = [];

  // If DTMF digits were pressed without speech, it's likely an automated system
  // that already played its prompt and the caller (or auto-system) pressed a key.
  if (digits && !text) {
    return {
      intent: "ORDER_CONFIRMATION",
      reason: `DTMF digits received: ${digits}`,
      platform: null,
    };
  }

  // Check for platform names.
  let detectedPlatform = null;
  for (const platform of PLATFORMS) {
    if (platform.keywords.some((kw) => text.includes(kw))) {
      detectedPlatform = platform.name;
      reasons.push(`matched platform "${platform.name}"`);
      break;
    }
  }

  // Check for confirmation phrases.
  const matchedConfirmation = CONFIRMATION_PHRASES.filter((phrase) => text.includes(phrase));
  if (matchedConfirmation.length > 0) {
    reasons.push(`matched "${matchedConfirmation[0]}"`);
  }

  // If we found a platform name OR confirmation phrases, it's a confirmation call.
  if (detectedPlatform || matchedConfirmation.length > 0) {
    return {
      intent: "ORDER_CONFIRMATION",
      reason: reasons.join(" and ") || "confirmation keywords detected",
      platform: detectedPlatform,
    };
  }

  // Check for customer ordering phrases.
  const matchedCustomer = CUSTOMER_PHRASES.filter((phrase) => text.includes(phrase));
  if (matchedCustomer.length > 0) {
    return {
      intent: "CUSTOMER_ORDER",
      reason: `matched customer phrase "${matchedCustomer[0]}"`,
      platform: null,
    };
  }

  // If there's substantial speech but no match either way, it's unknown.
  if (text.length > 0) {
    return {
      intent: "UNKNOWN",
      reason: "speech did not match confirmation or customer patterns",
      platform: null,
    };
  }

  // No speech at all — likely a human waiting for a prompt.
  return {
    intent: "CUSTOMER_ORDER",
    reason: "no speech detected, assuming human caller",
    platform: null,
  };
}

module.exports = { detectCallType };
