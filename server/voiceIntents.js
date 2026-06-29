// Simple keyword-based intent classifier for voice orders.

function detectIntent(speech, state) {
  const text = speech.toLowerCase().trim();

  // If awaiting confirmation, prioritize yes/no.
  if (state && state.awaitingConfirmation) {
    if (/\b(yes|yeah|yep|correct|right|send it|confirm|sure|okay|ok|do it|that's right|thats right)\b/.test(text)) {
      return { intent: "CONFIRM_YES" };
    }
    if (/\b(no|nope|wait|change|cancel|hold on|not yet)\b/.test(text)) {
      return { intent: "CONFIRM_NO" };
    }
  }

  // If there's a pending modifier question, try to match the answer.
  if (state && hasPendingModifiers(state)) {
    const pendingItem = state.items.find((i) => i.pendingModifiers && i.pendingModifiers.length > 0);
    if (pendingItem) {
      const group = pendingItem.pendingModifiers[0];
      const match = matchOptionFromSpeech(text, group.options);
      if (match) {
        return { intent: "SELECT_OPTION", data: { option: match, group } };
      }
    }
  }

  // Done ordering.
  if (/\b(that's all|thats all|that's it|thats it|nothing else|i'm done|im done|done|no thanks|nope that's it)\b/.test(text)) {
    return { intent: "DONE" };
  }

  // Ask about sizes.
  if (/\b(what sizes|sizes|size options)\b/.test(text)) {
    return { intent: "ASK_SIZES" };
  }

  // Ask about price.
  if (/\b(how much|price|cost|how expensive)\b/.test(text)) {
    return { intent: "ASK_PRICE" };
  }

  // Ask about ingredients.
  if (/\b(what comes on|ingredients|included|what's on|whats on|toppings on)\b/.test(text)) {
    return { intent: "ASK_INGREDIENTS" };
  }

  // Remove/exclude something.
  if (/^(no |remove |without |hold the )/.test(text) || /\b(no |remove |without )\b/.test(text)) {
    const item = text.replace(/^(no|remove|without|hold the)\s+/i, "").trim();
    return { intent: "REMOVE_MODIFIER", data: { text: item } };
  }

  // Add something extra.
  if (/^(add |extra )/.test(text) || /\b(add |extra )\b/.test(text)) {
    const item = text.replace(/^(add|extra)\s+/i, "").trim();
    return { intent: "ADD_MODIFIER", data: { text: item } };
  }

  // Confirmation yes/no outside of awaitingConfirmation (just in case).
  if (/^(yes|yeah|yep|sure|ok|okay)$/i.test(text)) {
    if (state && state.items && state.items.length > 0) {
      return { intent: "CONFIRM_YES" };
    }
  }

  // Default: assume they're ordering items.
  return { intent: "ORDER_ITEMS" };
}

function hasPendingModifiers(state) {
  if (!state || !state.items) return false;
  return state.items.some((i) => i.pendingModifiers && i.pendingModifiers.length > 0);
}

function matchOptionFromSpeech(text, options) {
  const words = text.split(/\s+/);
  let bestMatch = null;
  let bestScore = 0;

  for (const option of options) {
    const optLower = option.name.toLowerCase();
    // Exact match.
    if (text === optLower || words.includes(optLower)) {
      return option;
    }
    // Partial: option name appears in the speech.
    if (text.includes(optLower) && optLower.length > bestScore) {
      bestScore = optLower.length;
      bestMatch = option;
    }
    // Partial: speech appears in the option name.
    if (optLower.includes(text) && text.length >= 3 && text.length > bestScore) {
      bestScore = text.length;
      bestMatch = option;
    }
  }

  return bestMatch;
}

module.exports = { detectIntent, hasPendingModifiers, matchOptionFromSpeech };
