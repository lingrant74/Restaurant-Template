const express = require("express");
const db = require("../db/repositories");
const { printOrder } = require("../printService");

const router = express.Router();

// GET /api/restaurants/:restaurantId/printers
router.get("/api/restaurants/:restaurantId/printers", async (req, res) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const printers = await db.listPrintersForRestaurant(restaurantId);
    res.json(printers);
  } catch (err) {
    res.status(500).json({ error: "Failed to load printers" });
  }
});

// POST /api/restaurants/:restaurantId/printers
router.post("/api/restaurants/:restaurantId/printers", async (req, res) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { name, ipAddress, port, type, isDefault } = req.body;

    if (!name || !ipAddress) {
      return res.status(400).json({ error: "Name and IP address are required" });
    }

    // createPrinter unsets other defaults when isDefault is set.
    const printer = await db.createPrinter({
      name,
      ipAddress,
      port: port || 9100,
      type: type || "ESCPOS",
      isDefault: isDefault || false,
      restaurantId,
    });

    console.log(`🖨️  Printer "${name}" created at ${ipAddress}:${port || 9100}`);
    res.status(201).json(printer);
  } catch (err) {
    res.status(500).json({ error: "Failed to create printer" });
  }
});

// PATCH /api/printers/:id
router.patch("/api/printers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, ipAddress, port, type, isDefault, isOnline } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (ipAddress !== undefined) data.ipAddress = ipAddress;
    if (port !== undefined) data.port = Number(port);
    if (type !== undefined) data.type = type;
    if (isOnline !== undefined) data.isOnline = Boolean(isOnline);
    if (isDefault !== undefined) data.isDefault = Boolean(isDefault);

    // updatePrinter demotes the restaurant's other defaults when isDefault=true.
    const printer = await db.updatePrinter(id, data);

    res.json(printer);
  } catch (err) {
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: "Printer not found" });
    res.status(500).json({ error: "Failed to update printer" });
  }
});

// DELETE /api/printers/:id
router.delete("/api/printers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.deletePrinter(id);
    res.json({ success: true });
  } catch (err) {
    if (err.code === "NOT_FOUND") return res.status(404).json({ error: "Printer not found" });
    res.status(500).json({ error: "Failed to delete printer" });
  }
});

// PUT /api/printers/:id/categories
// Assign menu categories to this printer. Replaces all existing assignments.
router.put("/api/printers/:id/categories", async (req, res) => {
  try {
    const printerId = Number(req.params.id);
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "categoryIds must be an array" });
    }

    await db.setPrinterCategories(printerId, categoryIds.map(Number));

    const printer = await db.getPrinter(printerId);

    console.log(`🖨️  Printer "${printer.name}" assigned to categories: ${printer.categories.map((c) => c.category.name).join(", ") || "(none)"}`);
    res.json(printer);
  } catch (err) {
    res.status(500).json({ error: "Failed to assign categories" });
  }
});

// POST /api/orders/:orderId/print
// Triggers server-side print with category-based routing.
router.post("/api/orders/:orderId/print", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const results = await printOrder(orderId);

    const allSuccess = results.every((r) => r.success);
    console.log(`🖨️  Print results for order #${orderId}: ${results.map((r) => `${r.printerName}: ${r.success ? "✅" : "❌"}`).join(", ")}`);

    res.json({ success: allSuccess, results });
  } catch (err) {
    console.error(`❌ Print error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
