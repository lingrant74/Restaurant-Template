const express = require("express");
const db = require("../db/repositories");
const { printOrder } = require("../printService");
const { parseOrderRequest, buildVapiSuccess, buildVapiError } = require("../vapiProtocol");

const router = express.Router();

// POST /api/vapi/order
// Receives a confirmed order from Vapi's voice assistant and saves it to the database.
router.post("/api/vapi/order", async (req, res) => {
  console.log("───────────────────────────────────────");
  console.log("📞 Vapi order received:");
  console.log(JSON.stringify(req.body, null, 2));

  const parsedRequest = parseOrderRequest(req.body);

  if (parsedRequest.isVapiToolCall && !parsedRequest.toolCallId) {
    return res.status(400).json({ error: "Vapi tool call id is required" });
  }

  try {
    const {
      customerPhone,
      customerName,
      items,
      notes,
      restaurantId: bodyRestaurantId,
      transcript,
    } = parsedRequest.orderPayload;

    const restaurantId = Number(bodyRestaurantId) || Number(process.env.VOICE_RESTAURANT_ID) || 1;
    const normalizedPhone = String(customerPhone || "unknown").replace(/\D/g, "").slice(-10);

    // Build order items from the Vapi payload.
    let orderItems = [];
    let total = 0;

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const quantity = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
        const finalPrice = price + modifiers.reduce((sum, m) => sum + (Number(m.priceDelta) || 0), 0);

        orderItems.push({
          name: item.name || "Unknown item",
          quantity,
          price: finalPrice,
          basePrice: price,
          finalPrice,
          menuItemId: item.menuItemId || null,
          customerComment: item.notes || item.comment || null,
          selectedModifiers: modifiers.map((m) => ({
            groupId: m.groupId || null,
            groupName: m.groupName || m.group || "",
            optionId: m.optionId || null,
            optionName: m.optionName || m.name || "",
            priceDelta: String(m.priceDelta || "0.00"),
          })),
        });

        total += finalPrice * quantity;
      }
    } else {
      // Fallback: save the raw transcript as a generic order item.
      orderItems.push({
        name: "Voice order",
        quantity: 1,
        price: 0,
        basePrice: 0,
        finalPrice: 0,
        customerComment: notes || transcript || null,
      });
    }

    const order = await db.createOrder({
      customerName: customerName || "Phone Customer",
      customerPhone: normalizedPhone,
      notes: notes || transcript || null,
      source: "VOICE",
      status: "PENDING",
      paymentStatus: "UNPAID",
      total: total.toFixed(2),
      restaurantId,
      items: orderItems,
    });

    console.log(`✅ Vapi order #${order.id} created for restaurant ${restaurantId}`);
    console.log(`   Items: ${orderItems.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`);
    console.log(`   Total: $${total.toFixed(2)}`);

    // Auto-print if restaurant has it enabled.
    let printResults = null;
    const restaurant = await db.getRestaurantById(restaurantId);
    if (restaurant && restaurant.autoPrint) {
      try {
        printResults = await printOrder(order.id);
        console.log(`   🖨️  Auto-printed to ${printResults.length} printer(s)`);
      } catch (printErr) {
        console.log(`   ⚠️  Auto-print failed: ${printErr.message}`);
      }
    }

    console.log("───────────────────────────────────────");

    const result = { success: true, orderId: order.id, printed: printResults };

    if (parsedRequest.isVapiToolCall) {
      return res.json(buildVapiSuccess(parsedRequest.toolCallId, result));
    }

    return res.json(result);
  } catch (err) {
    console.error("❌ Failed to create Vapi order:", err);

    // Vapi expects HTTP 200 for tool execution errors and reads the error from
    // the matching result entry. Legacy/direct callers keep the normal 500.
    if (parsedRequest.isVapiToolCall) {
      return res.json(buildVapiError(parsedRequest.toolCallId, "Failed to create order"));
    }

    return res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

// GET /api/vapi/menu/:restaurantId
// GET /api/vapi/menu?phone=+19313399781
// Returns the restaurant menu formatted for Vapi's AI assistant.
async function handleMenuRequest(req, res) {
  try {
    let restaurantId = Number(req.params.restaurantId) || null;

    if (!restaurantId && req.query.phone) {
      const byPhone = await db.getRestaurantByTwilioNumber(req.query.phone);
      if (byPhone) restaurantId = byPhone.id;
    }

    if (!restaurantId) {
      return res.status(400).json({ error: "Provide a restaurant ID or ?phone= parameter" });
    }

    const restaurant = await db.getRestaurantByIdWithPublicMenu(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Format for Vapi
    const menu = restaurant.menuItems.map((item) => {
      const modifiers = item.modifierGroupLinks.map((link) => ({
        groupName: link.modifierGroup.name,
        required: link.modifierGroup.required,
        allowMultiple: link.modifierGroup.allowMultiple,
        minSelections: link.modifierGroup.minSelections,
        maxSelections: link.modifierGroup.maxSelections,
        options: link.modifierGroup.options.map((opt) => ({
          name: opt.name,
          priceDelta: Number(opt.priceDelta),
        })),
      }));

      return {
        menuItemId: item.id,
        name: item.name,
        description: item.description,
        category: item.menuCategory?.name || item.category || null,
        price: Number(item.price),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      };
    });

    res.json({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      phone: restaurant.twilioPhoneNumber,
      estimatedMinutes: restaurant.estimatedMinutes,
      operatingHours: restaurant.operatingHours,
      menu,
    });
  } catch (err) {
    console.error("Failed to load menu for Vapi:", err);
    res.status(500).json({ error: "Failed to load menu" });
  }
}

router.get("/api/vapi/menu/:restaurantId", handleMenuRequest);
router.get("/api/vapi/menu", handleMenuRequest);

module.exports = router;
