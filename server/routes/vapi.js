const express = require("express");
const prisma = require("../prismaClient");
const { printOrder } = require("../printService");

const router = express.Router();

// POST /api/vapi/order
// Receives a confirmed order from Vapi's voice assistant and saves it to the database.
router.post("/api/vapi/order", async (req, res) => {
  console.log("───────────────────────────────────────");
  console.log("📞 Vapi order received:");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const {
      customerPhone,
      customerName,
      items,
      notes,
      restaurantId: bodyRestaurantId,
    } = req.body;

    const restaurantId = bodyRestaurantId || Number(process.env.VOICE_RESTAURANT_ID) || 1;
    const normalizedPhone = (customerPhone || "unknown").replace(/\D/g, "").slice(-10);

    // Build order items from the Vapi payload.
    let orderItems = [];
    let total = 0;

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const quantity = item.quantity || 1;
        const price = Number(item.price) || 0;
        const finalPrice = price + (item.modifiers || []).reduce((sum, m) => sum + (Number(m.priceDelta) || 0), 0);

        orderItems.push({
          name: item.name || "Unknown item",
          quantity,
          price: finalPrice,
          basePrice: price,
          finalPrice,
          menuItemId: item.menuItemId || null,
          customerComment: item.notes || item.comment || null,
          selectedModifiers: (item.modifiers || []).map((m) => ({
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
        customerComment: notes || req.body.transcript || null,
      });
    }

    const order = await prisma.order.create({
      data: {
        customerName: customerName || "Phone Customer",
        customerPhone: normalizedPhone,
        notes: notes || req.body.transcript || null,
        source: "VOICE",
        status: "PENDING",
        paymentStatus: "UNPAID",
        total: total.toFixed(2),
        restaurantId,
        items: { create: orderItems },
      },
    });

    console.log(`✅ Vapi order #${order.id} created for restaurant ${restaurantId}`);
    console.log(`   Items: ${orderItems.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`);
    console.log(`   Total: $${total.toFixed(2)}`);

    // Auto-print if restaurant has it enabled.
    let printResults = null;
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (restaurant && restaurant.autoPrint) {
      try {
        printResults = await printOrder(order.id);
        console.log(`   🖨️  Auto-printed to ${printResults.length} printer(s)`);
      } catch (printErr) {
        console.log(`   ⚠️  Auto-print failed: ${printErr.message}`);
      }
    }

    console.log("───────────────────────────────────────");

    res.json({ success: true, orderId: order.id, printed: printResults });
  } catch (err) {
    console.error("❌ Failed to create Vapi order:", err);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

// GET /api/vapi/menu/:restaurantId
// GET /api/vapi/menu?phone=+19313399781
// Returns the restaurant menu formatted for Vapi's AI assistant.
async function handleMenuRequest(req, res) {
  try {
    let restaurantId = Number(req.params.restaurantId) || null;

    if (!restaurantId && req.query.phone) {
      const byPhone = await prisma.restaurant.findUnique({
        where: { twilioPhoneNumber: req.query.phone },
      });
      if (byPhone) restaurantId = byPhone.id;
    }

    if (!restaurantId) {
      return res.status(400).json({ error: "Provide a restaurant ID or ?phone= parameter" });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        categories: { orderBy: { sortOrder: "asc" } },
        menuItems: {
          where: { isAvailable: true },
          include: {
            menuCategory: true,
            modifierGroupLinks: {
              include: {
                modifierGroup: {
                  include: {
                    options: {
                      where: { available: true },
                      orderBy: [{ sort: "asc" }, { name: "asc" }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

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
