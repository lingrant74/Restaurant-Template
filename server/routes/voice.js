const express = require("express");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const prisma = require("../prismaClient");
const { parseVoiceOrder, loadItemModifiers } = require("../voiceParser");
const { getState, setState, clearState } = require("../voiceState");
const { detectIntent, hasPendingModifiers } = require("../voiceIntents");
const { detectCallType } = require("../callClassifier");

const router = express.Router();

router.use(express.urlencoded({ extended: false }));

// GET /health
router.get("/health", (req, res) => {
  res.send("Backend is running");
});

// POST /api/voice/incoming
// Listens briefly for automated systems before greeting. If the caller is
// silent (a human waiting), falls through to the normal greeting.
router.post("/api/voice/incoming", async (req, res) => {
  const callerPhone = req.body.From || "unknown";
  const calledNumber = req.body.To || "";
  const callSid = req.body.CallSid || "unknown";

  console.log("───────────────────────────────────────");
  console.log("📞 Incoming call:");
  console.log(`   CallSid: ${callSid}`);
  console.log(`   From:    ${callerPhone}`);
  console.log(`   To:      ${calledNumber}`);

  const twiml = new VoiceResponse();

  // Look up restaurant by the Twilio number that was called.
  let restaurant = null;
  if (calledNumber) {
    restaurant = await prisma.restaurant.findUnique({
      where: { twilioPhoneNumber: calledNumber },
    });
  }

  // Fall back to env var / default for backward compatibility (curl tests).
  if (!restaurant) {
    const fallbackId = Number(process.env.VOICE_RESTAURANT_ID) || 1;
    restaurant = await prisma.restaurant.findUnique({ where: { id: fallbackId } });
  }

  if (!restaurant) {
    console.log("   ❌ No restaurant found for this number");
    console.log("───────────────────────────────────────");
    twiml.say("Sorry, this phone number is not connected to a restaurant yet.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  console.log(`   ✅ Restaurant: ${restaurant.name} (id: ${restaurant.id})`);
  console.log("───────────────────────────────────────");

  // Initialize call state with the restaurant and handoff settings.
  setState(callSid, {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    callerPhone,
    items: [],
    awaitingConfirmation: false,
    failedAttempts: 0,
    handoffSettings: {
      aiHandoffMode: restaurant.aiHandoffMode,
      maxFailedAttempts: restaurant.maxFailedAttempts,
      allowCustomerRequestHandoff: restaurant.allowCustomerRequestHandoff,
      handoffPhoneNumber: restaurant.handoffPhoneNumber,
    },
  });

  // If mode is ALWAYS, immediately transfer.
  if (restaurant.aiHandoffMode === "ALWAYS") {
    console.log("   📞 Handoff mode: ALWAYS — transferring immediately");
    if (restaurant.handoffPhoneNumber) {
      twiml.say("Let me connect you to the restaurant.");
      twiml.dial(restaurant.handoffPhoneNumber);
    } else {
      twiml.say("Sorry, I cannot connect you to the restaurant right now. Please try again later.");
    }
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // Listen briefly for automated speech/DTMF before greeting.
  // Automated systems speak immediately; humans wait for a prompt.
  const gather = twiml.gather({
    input: "speech dtmf",
    action: "/api/voice/classify",
    method: "POST",
    speechTimeout: "3",
    timeout: 4,
  });
  gather.pause({ length: 1 });

  // If no speech/digits detected (human caller waiting), fall through to greeting.
  const greetGather = twiml.gather({
    input: "speech",
    action: "/api/voice/process",
    method: "POST",
    speechTimeout: "auto",
  });
  greetGather.say(`Hello. Welcome to ${restaurant.name}. What would you like to order?`);
  twiml.say("Sorry, I did not hear anything. Please call again.");

  res.type("text/xml");
  res.send(twiml.toString());
});

// POST /api/voice/classify
// Classifies the first speech/digits to determine call type.
router.post("/api/voice/classify", async (req, res) => {
  const speechResult = req.body.SpeechResult || "";
  const digits = req.body.Digits || "";
  const callerPhone = req.body.From || "unknown";
  const callSid = req.body.CallSid || "unknown";

  const classification = detectCallType({ speechResult, digits, from: callerPhone });

  console.log("🔍 Call classification:");
  console.log(`   CallSid:  ${callSid}`);
  console.log(`   Speech:   "${speechResult}"`);
  console.log(`   Digits:   ${digits || "(none)"}`);
  console.log(`   Intent:   ${classification.intent}`);
  console.log(`   Platform: ${classification.platform || "(none)"}`);
  console.log(`   Reason:   ${classification.reason}`);

  const twiml = new VoiceResponse();
  const state = getState(callSid);

  if (classification.intent === "ORDER_CONFIRMATION") {
    console.log("   Action:   Pressing 1, hanging up");
    console.log("───────────────────────────────────────");
    twiml.play({ digits: "1" });
    twiml.say("Order confirmed.");
    twiml.hangup();
  } else if (classification.intent === "CUSTOMER_ORDER") {
    console.log("   Action:   Continuing to customer order flow");
    console.log("───────────────────────────────────────");
    // The caller already said something order-like — feed it into the order flow.
    // Redirect to /process so their speech gets parsed as an order.
    const gather = twiml.gather({
      input: "speech",
      action: "/api/voice/process",
      method: "POST",
      speechTimeout: "auto",
    });
    const restaurantName = (state && state.restaurantName) || "the restaurant";
    gather.say(`Welcome to ${restaurantName}. I heard you say: ${speechResult}. Is that what you'd like to order, or would you like something else?`);
    twiml.say("Sorry, I did not hear anything. Goodbye.");
  } else {
    // UNKNOWN — ask if they want to place an order.
    console.log("   Action:   Asking if caller wants to order");
    console.log("───────────────────────────────────────");
    const gather = twiml.gather({
      input: "speech",
      action: "/api/voice/classify-confirm",
      method: "POST",
      speechTimeout: "auto",
    });
    gather.say("Are you calling to place a new order?");
    twiml.say("I did not hear a response. Goodbye.");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// POST /api/voice/classify-confirm
// Handles the yes/no response to "Are you calling to place a new order?"
router.post("/api/voice/classify-confirm", async (req, res) => {
  const speechResult = req.body.SpeechResult || "";
  const callSid = req.body.CallSid || "unknown";
  const text = speechResult.toLowerCase().trim();

  console.log(`🔍 Classify confirm: "${speechResult}" (CallSid: ${callSid})`);

  const twiml = new VoiceResponse();
  const state = getState(callSid);

  if (/\b(yes|yeah|yep|sure|ok|okay|order|i want|i'd like)\b/.test(text)) {
    console.log("   → Caller wants to order, continuing flow");
    const restaurantName = (state && state.restaurantName) || "the restaurant";
    const gather = twiml.gather({
      input: "speech",
      action: "/api/voice/process",
      method: "POST",
      speechTimeout: "auto",
    });
    gather.say(`Great! Welcome to ${restaurantName}. What would you like to order?`);
    twiml.say("Sorry, I did not hear anything. Please call again.");
  } else {
    console.log("   → Caller does not want to order, hanging up");
    twiml.say("No problem. Goodbye, have a nice day.");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// POST /api/voice/process
// Multi-turn conversational order handler.
router.post("/api/voice/process", async (req, res) => {
  const speechResult = req.body.SpeechResult || "(no speech detected)";
  const confidence = req.body.Confidence || "N/A";
  const callerPhone = req.body.From || "unknown";
  const callSid = req.body.CallSid || "unknown";

  // Get restaurantId from call state (set in /incoming), fall back to env/default.
  const existingState = getState(callSid);
  const restaurantId = (existingState && existingState.restaurantId) || Number(process.env.VOICE_RESTAURANT_ID) || 1;

  console.log("───────────────────────────────────────");
  console.log("📞 Voice transcription received:");
  console.log(`   CallSid:    ${callSid}`);
  console.log(`   Phone:      ${callerPhone}`);
  console.log(`   Said:       "${speechResult}"`);
  console.log(`   Confidence: ${confidence}`);

  let state = existingState;
  const intent = detectIntent(speechResult, state);
  console.log(`🧠 Intent: ${intent.intent}`);

  // Check for immediate handoff on ASK_HUMAN intent.
  if (intent.intent === "ASK_HUMAN") {
    const handoffResult = attemptHandoff(state, "customer_requested");
    if (handoffResult) {
      console.log(`📞 Handoff: ${handoffResult.reason}`);
      const twiml = new VoiceResponse();
      if (handoffResult.type === "transfer") {
        twiml.say("Let me connect you to the restaurant.");
        twiml.dial(handoffResult.phoneNumber);
      } else {
        const gather = twiml.gather({ input: "speech", action: "/api/voice/process", method: "POST", speechTimeout: "auto" });
        gather.say(handoffResult.message);
        twiml.say("Sorry, I did not hear anything. Goodbye.");
      }
      res.type("text/xml");
      return res.send(twiml.toString());
    }
  }

  let responseText;

  try {
    switch (intent.intent) {
      case "CONFIRM_YES":
        responseText = await handleConfirmYes(state, callSid, callerPhone);
        break;
      case "CONFIRM_NO":
        responseText = handleConfirmNo(state);
        break;
      case "SELECT_OPTION":
        responseText = handleSelectOption(state, intent.data, callSid);
        break;
      case "DONE":
        responseText = handleDone(state, callSid);
        break;
      case "ASK_SIZES":
        responseText = await handleAskSizes(state, speechResult, restaurantId);
        break;
      case "ASK_PRICE":
        responseText = await handleAskPrice(state, speechResult);
        break;
      case "ASK_INGREDIENTS":
        responseText = await handleAskIngredients(state, speechResult, restaurantId);
        break;
      case "ADD_MODIFIER":
        responseText = handleAddModifier(state, intent.data, callSid);
        break;
      case "REMOVE_MODIFIER":
        responseText = handleRemoveModifier(state, intent.data, callSid);
        break;
      case "ASK_HUMAN":
        responseText = "Sorry, live transfer is not available right now. Please continue with your order or call the restaurant directly.";
        break;
      case "ORDER_ITEMS":
      default:
        responseText = await handleOrderItems(speechResult, restaurantId, callerPhone, callSid, state);
        break;
    }
  } catch (err) {
    console.error("❌ Error in voice handler:", err);
    responseText = "Sorry, something went wrong. What would you like to order?";
  }

  // Track failed attempts (when parser couldn't match anything).
  if (responseText && (responseText.includes("couldn't find that") || responseText.includes("didn't catch that"))) {
    if (state) {
      state.failedAttempts = (state.failedAttempts || 0) + 1;
      setState(callSid, state);
      console.log(`   ⚠️ Failed attempts: ${state.failedAttempts}`);

      // Check if we should handoff after failures.
      const handoffResult = attemptHandoff(state, "failed_attempts");
      if (handoffResult && handoffResult.type === "transfer") {
        console.log(`📞 Handoff after ${state.failedAttempts} failures: ${handoffResult.reason}`);
        const twiml = new VoiceResponse();
        twiml.say("Let me connect you to the restaurant.");
        twiml.dial(handoffResult.phoneNumber);
        res.type("text/xml");
        return res.send(twiml.toString());
      }
    }
  }

  console.log(`💬 Response: "${responseText}"`);
  console.log("───────────────────────────────────────");

  const twiml = new VoiceResponse();

  // If order was placed, don't gather — end the call.
  if (responseText.startsWith("__END__")) {
    twiml.say(responseText.replace("__END__", ""));
  } else {
    const gather = twiml.gather({
      input: "speech",
      action: "/api/voice/process",
      method: "POST",
      speechTimeout: "auto",
    });
    gather.say(responseText);
    twiml.say("Sorry, I did not hear anything. Goodbye.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ─── Intent Handlers ────────────────────────────────────────────────────────

async function handleOrderItems(speechResult, restaurantId, callerPhone, callSid, existingState) {
  const { matchedItems, unmatchedText } = await parseVoiceOrder(speechResult, restaurantId);

  if (matchedItems.length === 0) {
    if (existingState && existingState.items.length > 0) {
      return "I didn't catch that. You can say what you'd like to order, or say that's all to finish.";
    }
    return "I couldn't find that on our menu. Could you try again? For example, say pepperoni pizza or house salad.";
  }

  // Load modifiers for each matched item.
  const newItems = [];
  for (const item of matchedItems) {
    const modGroups = await loadItemModifiers(item.menuItemId);
    const requiredGroups = modGroups.filter((g) => g.required);

    newItems.push({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      selectedModifiers: [],
      pendingModifiers: requiredGroups,
      customerComment: null,
    });

    console.log(`🔍 Matched: ${item.name} x${item.quantity}`);
    if (modGroups.length > 0) {
      console.log(`📋 Modifiers for ${item.name}: ${modGroups.map((g) => `${g.groupName} (${g.required ? "required" : "optional"})`).join(", ")}`);
    }
  }

  // Initialize or update state.
  const state = existingState || {
    restaurantId,
    callerPhone,
    items: [],
    awaitingConfirmation: false,
  };
  state.items.push(...newItems);
  setState(callSid, state);

  if (unmatchedText) {
    console.log(`   Unmatched: ${unmatchedText}`);
  }

  // Check if any item has pending required modifiers.
  const itemWithPending = state.items.find((i) => i.pendingModifiers && i.pendingModifiers.length > 0);
  if (itemWithPending) {
    const group = itemWithPending.pendingModifiers[0];
    const optionNames = group.options.map((o) => o.name).join(", ");
    return `What ${group.groupName.toLowerCase()} would you like for the ${itemWithPending.name}? We have ${optionNames}.`;
  }

  const summary = state.items.map((i) => `${i.quantity} ${i.name}`).join(", ");
  return `I have ${summary}. Would you like anything else, or should I send this order?`;
}

function handleSelectOption(state, data, callSid) {
  if (!state) return "I'm sorry, could you start your order again?";

  const { option, group } = data;
  const item = state.items.find((i) => i.pendingModifiers && i.pendingModifiers.length > 0 && i.pendingModifiers[0].groupId === group.groupId);

  if (!item) return "I'm not sure which item that applies to. What would you like to order?";

  // Add the selected modifier.
  item.selectedModifiers.push({
    groupId: group.groupId,
    groupName: group.groupName,
    optionId: option.id,
    optionName: option.name,
    priceDelta: option.priceDelta.toFixed(2),
  });

  // Remove this group from pending.
  item.pendingModifiers.shift();
  setState(callSid, state);

  console.log(`   → "${option.name}" selected for ${group.groupName} on ${item.name}`);

  // Check if there are more pending modifiers.
  const nextPending = state.items.find((i) => i.pendingModifiers && i.pendingModifiers.length > 0);
  if (nextPending) {
    const nextGroup = nextPending.pendingModifiers[0];
    const optionNames = nextGroup.options.map((o) => o.name).join(", ");
    return `Got it, ${option.name}. What ${nextGroup.groupName.toLowerCase()} for the ${nextPending.name}? We have ${optionNames}.`;
  }

  const summary = buildOrderSummary(state);
  return `Got it, ${option.name}. ${summary}. Would you like anything else, or should I send this order?`;
}

function handleDone(state, callSid) {
  if (!state || state.items.length === 0) {
    return "You haven't ordered anything yet. What would you like?";
  }

  // Check for pending required modifiers.
  const itemWithPending = state.items.find((i) => i.pendingModifiers && i.pendingModifiers.length > 0);
  if (itemWithPending) {
    const group = itemWithPending.pendingModifiers[0];
    const optionNames = group.options.map((o) => o.name).join(", ");
    return `Before I can finish, I need the ${group.groupName.toLowerCase()} for your ${itemWithPending.name}. We have ${optionNames}.`;
  }

  state.awaitingConfirmation = true;
  setState(callSid, state);

  const summary = buildOrderSummary(state);
  const total = calculateTotal(state);
  return `Here's your order: ${summary}. Total is $${total.toFixed(2)}. Should I send this to the restaurant?`;
}

async function handleConfirmYes(state, callSid, callerPhone) {
  if (!state || state.items.length === 0) {
    return "You haven't ordered anything yet. What would you like?";
  }

  const normalizedPhone = callerPhone.replace(/\D/g, "").slice(-10);
  const total = calculateTotal(state);

  const orderItems = state.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    basePrice: item.price,
    finalPrice: item.price + item.selectedModifiers.reduce((s, m) => s + Number(m.priceDelta), 0),
    menuItemId: item.menuItemId,
    customerComment: item.customerComment,
    selectedModifiers: item.selectedModifiers,
  }));

  const order = await prisma.order.create({
    data: {
      customerName: "Phone Customer",
      customerPhone: normalizedPhone,
      notes: `[Voice order] ${buildOrderSummary(state)}`,
      source: "VOICE",
      status: "PENDING",
      paymentStatus: "UNPAID",
      total: total.toFixed(2),
      restaurantId: state.restaurantId,
      items: { create: orderItems },
    },
  });

  console.log(`✅ Voice order #${order.id} created for restaurant ${state.restaurantId}`);
  console.log("📦 Final order payload:");
  orderItems.forEach((item) => {
    const mods = item.selectedModifiers.length > 0
      ? ` (${item.selectedModifiers.map((m) => m.optionName).join(", ")})`
      : "";
    console.log(`   ${item.quantity}x ${item.name}${mods} - $${(item.finalPrice * item.quantity).toFixed(2)}`);
  });

  clearState(callSid);

  const summary = buildOrderSummary(state);
  return `__END__Your order has been sent to the restaurant. ${summary}. Total is $${total.toFixed(2)}. Thank you for calling!`;
}

function handleConfirmNo(state) {
  if (!state) return "What would you like to order?";
  state.awaitingConfirmation = false;
  return "No problem. What would you like to change? You can add more items or say that's all when ready.";
}

async function handleAskSizes(state, speech, restaurantId) {
  // Try to find which item they're asking about.
  const item = await findReferencedItem(state, speech, restaurantId);
  if (!item) return "Which item would you like to know the sizes for?";

  const modGroups = await loadItemModifiers(item.menuItemId);
  const sizeGroup = modGroups.find((g) => g.groupName.toLowerCase().includes("size"));

  if (!sizeGroup) {
    return `${item.name} does not have size options.`;
  }

  const options = sizeGroup.options.map((o) => {
    const price = o.priceDelta > 0 ? ` adds $${o.priceDelta.toFixed(2)}` : "";
    return `${o.name}${price}`;
  }).join(", ");

  return `For ${item.name}, we have: ${options}. Which would you like?`;
}

async function handleAskPrice(state, speech) {
  // Try to find a modifier option name in the speech.
  if (!state || state.items.length === 0) {
    return "What item would you like to know the price of?";
  }

  const lastItem = state.items[state.items.length - 1];
  const modGroups = await loadItemModifiers(lastItem.menuItemId);
  const text = speech.toLowerCase();

  for (const group of modGroups) {
    for (const option of group.options) {
      if (text.includes(option.name.toLowerCase())) {
        if (option.priceDelta > 0) {
          return `${option.name} adds $${option.priceDelta.toFixed(2)} to the ${lastItem.name}.`;
        }
        return `${option.name} has no extra charge.`;
      }
    }
  }

  return `The base price of ${lastItem.name} is $${lastItem.price.toFixed(2)}. I do not have the exact price for that specific option.`;
}

async function handleAskIngredients(state, speech, restaurantId) {
  const item = await findReferencedItem(state, speech, restaurantId);
  if (!item) return "Which item would you like to know about?";

  // Check if the item has a description in the database.
  const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
  if (menuItem && menuItem.description) {
    return `${item.name}: ${menuItem.description}`;
  }

  return `I do not have the ingredient details for ${item.name}.`;
}

function handleAddModifier(state, data, callSid) {
  if (!state || state.items.length === 0) {
    return "Please order an item first, then you can add extras.";
  }

  const lastItem = state.items[state.items.length - 1];
  const text = data.text.toLowerCase();

  // Search through the item's modifiers (already loaded if they exist in selectedModifiers context).
  // We need to load them fresh — but since this is sync, we'll do a simple check.
  // For MVP, store the add request as a customer comment.
  if (!lastItem.customerComment) {
    lastItem.customerComment = `ADD ${data.text}`;
  } else {
    lastItem.customerComment += `, ADD ${data.text}`;
  }
  setState(callSid, state);

  return `Got it, adding ${data.text} to your ${lastItem.name}. Anything else?`;
}

function handleRemoveModifier(state, data, callSid) {
  if (!state || state.items.length === 0) {
    return "Please order an item first, then you can request removals.";
  }

  const lastItem = state.items[state.items.length - 1];
  if (!lastItem.customerComment) {
    lastItem.customerComment = `NO ${data.text}`;
  } else {
    lastItem.customerComment += `, NO ${data.text}`;
  }
  setState(callSid, state);

  return `Got it, no ${data.text} on your ${lastItem.name}. Anything else?`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildOrderSummary(state) {
  return state.items.map((item) => {
    const mods = item.selectedModifiers.map((m) => m.optionName).join(", ");
    const modStr = mods ? ` ${mods}` : "";
    return `${item.quantity} ${item.name}${modStr}`;
  }).join(", ");
}

function calculateTotal(state) {
  return state.items.reduce((sum, item) => {
    const modTotal = item.selectedModifiers.reduce((s, m) => s + Number(m.priceDelta), 0);
    return sum + (item.price + modTotal) * item.quantity;
  }, 0);
}

async function findReferencedItem(state, speech, restaurantId) {
  // First check if they mentioned an item already in their order.
  if (state && state.items.length > 0) {
    const text = speech.toLowerCase();
    for (const item of state.items) {
      if (text.includes(item.name.toLowerCase())) {
        return item;
      }
    }
    // Default to the last item if no specific mention.
    return state.items[state.items.length - 1];
  }

  // Try to match from menu.
  const { matchedItems } = await parseVoiceOrder(speech, restaurantId);
  if (matchedItems.length > 0) {
    return matchedItems[0];
  }
  return null;
}

/**
 * Checks if the call should be handed off to a human.
 * Returns null if no handoff, or { type, phoneNumber, message, reason }.
 */
function attemptHandoff(state, trigger) {
  if (!state || !state.handoffSettings) return null;

  const { aiHandoffMode, maxFailedAttempts, allowCustomerRequestHandoff, handoffPhoneNumber } = state.handoffSettings;

  if (trigger === "customer_requested") {
    if (aiHandoffMode === "NEVER" || !allowCustomerRequestHandoff) {
      return {
        type: "message",
        message: "Sorry, live transfer is not available right now. Please continue with your order or call the restaurant directly.",
        reason: "handoff mode is NEVER or customer request not allowed",
      };
    }
    if (aiHandoffMode === "WHEN_CUSTOMER_ASKS" || aiHandoffMode === "AFTER_FAILED_ATTEMPTS") {
      if (!handoffPhoneNumber) {
        return {
          type: "message",
          message: "Sorry, I cannot connect you to the restaurant right now.",
          reason: "no handoff phone number configured",
        };
      }
      return {
        type: "transfer",
        phoneNumber: handoffPhoneNumber,
        reason: "customer requested human, mode allows it",
      };
    }
  }

  if (trigger === "failed_attempts") {
    if (aiHandoffMode !== "AFTER_FAILED_ATTEMPTS") return null;
    const failures = state.failedAttempts || 0;
    if (failures >= maxFailedAttempts) {
      if (!handoffPhoneNumber) {
        return {
          type: "message",
          message: "Sorry, I cannot connect you to the restaurant right now. Please try again.",
          reason: "max failures reached but no handoff phone number",
        };
      }
      return {
        type: "transfer",
        phoneNumber: handoffPhoneNumber,
        reason: `${failures} failed attempts reached threshold of ${maxFailedAttempts}`,
      };
    }
  }

  return null;
}

// ─── Voice Settings API ─────────────────────────────────────────────────────

// PATCH /api/restaurants/:restaurantId/voice-settings
router.patch("/api/restaurants/:restaurantId/voice-settings", async (req, res) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({ error: "Restaurant id must be a number" });
    }

    const { aiHandoffMode, maxFailedAttempts, allowCustomerRequestHandoff, handoffPhoneNumber } = req.body;
    const validModes = ["NEVER", "ALWAYS", "WHEN_CUSTOMER_ASKS", "AFTER_FAILED_ATTEMPTS"];

    const data = {};
    if (aiHandoffMode !== undefined) {
      if (!validModes.includes(aiHandoffMode)) {
        return res.status(400).json({ error: `aiHandoffMode must be one of: ${validModes.join(", ")}` });
      }
      data.aiHandoffMode = aiHandoffMode;
    }
    if (maxFailedAttempts !== undefined) {
      data.maxFailedAttempts = Number(maxFailedAttempts);
    }
    if (allowCustomerRequestHandoff !== undefined) {
      data.allowCustomerRequestHandoff = Boolean(allowCustomerRequestHandoff);
    }
    if (handoffPhoneNumber !== undefined) {
      data.handoffPhoneNumber = handoffPhoneNumber || null;
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data,
    });

    console.log(`⚙️ Voice settings updated for ${restaurant.name}: ${JSON.stringify(data)}`);
    res.json({
      aiHandoffMode: restaurant.aiHandoffMode,
      maxFailedAttempts: restaurant.maxFailedAttempts,
      allowCustomerRequestHandoff: restaurant.allowCustomerRequestHandoff,
      handoffPhoneNumber: restaurant.handoffPhoneNumber,
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    res.status(500).json({ error: "Failed to update voice settings" });
  }
});

module.exports = router;
