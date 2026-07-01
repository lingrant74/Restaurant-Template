const net = require("net");
const db = require("./db/repositories");

/**
 * Print an order, routing items to the correct printers based on menu category.
 * Returns an array of { printerId, printerName, success, error? }
 */
async function printOrder(orderId) {
  const order = await db.getOrder(orderId);

  if (!order) throw new Error(`Order #${orderId} not found`);

  const printers = await db.listOnlinePrinters(order.restaurantId);

  if (printers.length === 0) {
    throw new Error(`No online printers for restaurant ${order.restaurantId}`);
  }

  // Build a map: categoryId → printer
  const categoryToPrinter = new Map();
  for (const printer of printers) {
    for (const link of printer.categories) {
      categoryToPrinter.set(link.categoryId, printer);
    }
  }

  // Find the default printer (fallback for uncategorized items)
  const defaultPrinter = printers.find((p) => p.isDefault) || printers[0];

  // Order items are stored embedded (menuItemId only), so resolve each distinct
  // item's menu category to route it to the right printer.
  const categoryByMenuItemId = new Map();
  for (const item of order.items) {
    if (item.menuItemId != null && !categoryByMenuItemId.has(item.menuItemId)) {
      const menuItem = await db.getMenuItem(item.menuItemId);
      categoryByMenuItemId.set(item.menuItemId, menuItem ? menuItem.categoryId : null);
    }
  }

  // Group items by printer
  const printerGroups = new Map();
  for (const item of order.items) {
    const categoryId = item.menuItemId != null ? categoryByMenuItemId.get(item.menuItemId) : null;
    const printer = (categoryId != null && categoryToPrinter.get(categoryId)) || defaultPrinter;

    if (!printerGroups.has(printer.id)) {
      printerGroups.set(printer.id, { printer, items: [] });
    }
    printerGroups.get(printer.id).items.push(item);
  }

  // Print to each printer
  const results = [];
  for (const [, { printer, items }] of printerGroups) {
    const ticket = formatTicket(order, items);
    console.log(`🖨️  Printing to "${printer.name}" (${printer.ipAddress}:${printer.port})`);
    console.log(`   Items: ${items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`);

    try {
      await sendToPrinter(printer.ipAddress, printer.port, ticket);
      results.push({ printerId: printer.id, printerName: printer.name, success: true });
    } catch (err) {
      console.error(`   ❌ Print failed: ${err.message}`);
      results.push({ printerId: printer.id, printerName: printer.name, success: false, error: err.message });
    }
  }

  // Mark order as printed
  await db.updateOrder(orderId, { printedAt: new Date() });

  return results;
}

/**
 * Format an ESC/POS ticket for a subset of items.
 */
function formatTicket(order, items) {
  const lines = [];
  const ESC = "\x1B";
  const GS = "\x1D";

  // Initialize + bold
  lines.push(`${ESC}@`);
  lines.push(`${ESC}E\x01`); // bold on

  // Header
  lines.push(`ORDER #${order.orderNumber || order.id}`);
  lines.push(`${order.source === "VOICE" ? "PHONE" : "ONLINE"} | ${new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
  lines.push(`${ESC}E\x00`); // bold off
  lines.push("--------------------------------");

  // Customer
  lines.push(`${order.customerName}`);
  lines.push(`${order.customerPhone}`);
  lines.push("--------------------------------");

  // Items
  for (const item of items) {
    lines.push(`${ESC}E\x01`); // bold
    lines.push(`${item.quantity}x ${item.name.toUpperCase()}`);
    lines.push(`${ESC}E\x00`); // bold off

    // Modifiers
    const mods = typeof item.selectedModifiers === "string"
      ? JSON.parse(item.selectedModifiers)
      : item.selectedModifiers || [];
    for (const mod of mods) {
      lines.push(`  + ${mod.optionName}`);
    }

    // Customer comment
    if (item.customerComment) {
      lines.push(`  * ${item.customerComment}`);
    }
  }

  lines.push("--------------------------------");

  // Total (for this printer's items)
  const subtotal = items.reduce((sum, i) => sum + Number(i.finalPrice) * i.quantity, 0);
  lines.push(`SUBTOTAL: $${subtotal.toFixed(2)}`);
  lines.push("");
  lines.push("");

  // Cut
  lines.push(`${GS}V\x00`);

  return lines.join("\n");
}

/**
 * Send raw bytes to a thermal printer over TCP.
 */
function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, ip, () => {
      socket.write(data, "binary", () => {
        socket.end();
        resolve();
      });
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Connection to ${ip}:${port} timed out`));
    });

    socket.on("error", (err) => {
      reject(new Error(`Printer ${ip}:${port}: ${err.message}`));
    });
  });
}

module.exports = { printOrder };
