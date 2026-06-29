const express = require("express");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const prisma = require("../prismaClient");
const { parseVoiceOrder, loadItemModifiers } = require("../voiceParser");
const { getState, setState, clearState } = require("../voiceState");
const { detectIntent, hasPendingModifiers } = require("../voiceIntents");

const router = express.Router();

router.use(express.urlencoded({ extended: false }));

// GET /health
router.get("/health", (req, res) => {
  res.send("Backend is running");
});

// POST /api/voice/incoming
router.post("/api/voice/incoming", (req, res) => {
  const callerPhone = req.body.From || "unknown";
  console.log(`📞 Incoming call from: ${callerPhone}`);

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: "/api/voice/process",
    method: "POST",
    speechTimeout: "auto",
  });
  gather.say("Hello. Welcome to the restaurant AI assistant. What would you like to order?");
  twiml.say("Sorry, I did not hear anything. Please call again.");

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
  const restaurantId = Number(process.env.VOICE_RESTAURANT_ID) || 1;

  console.log("───────────────────────────────────────");
  console.log("📞 Voice transcription received:");
  console.log(`   CallSid:    ${callSid}`);
  console.log(`   Phone:      ${callerPhone}`);
  console.log(`   Said:       "${speechResult}"`);
  console.log(`   Confidence: ${confidence}`);

  let state = getState(callSid);
  const intent = detectIntent(speechResult, state);
  console.log(`🧠 Intent: ${intent.intent}`);

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
      case "ORDER_ITEMS":
      default:
        responseText = await handleOrderItems(speechResult, restaurantId, callerPhone, callSid, state);
        break;
    }
  } catch (err) {
    console.error("❌ Error in voice handler:", err);
    responseText = "Sorry, something went wrong. What would you like to order?";
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

module.exports = router;
