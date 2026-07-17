const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseOrderRequest,
  buildVapiSuccess,
  buildVapiError,
} = require("../vapiProtocol");

test("parses the current Vapi tool-calls request format", () => {
  const parsed = parseOrderRequest({
    message: {
      type: "tool-calls",
      toolCallList: [{
        id: "call_123",
        name: "save_restaurant_order",
        arguments: {
          restaurantId: 1,
          customerPhone: "+19315551234",
          items: [{ name: "Pizza", quantity: 1, price: 12.99 }],
        },
      }],
    },
  });

  assert.equal(parsed.isVapiToolCall, true);
  assert.equal(parsed.toolCallId, "call_123");
  assert.equal(parsed.toolName, "save_restaurant_order");
  assert.equal(parsed.orderPayload.restaurantId, 1);
  assert.equal(parsed.orderPayload.items[0].name, "Pizza");
});

test("parses Vapi parameters nested in toolWithToolCallList", () => {
  const parsed = parseOrderRequest({
    message: {
      type: "tool-calls",
      toolWithToolCallList: [{
        name: "save_restaurant_order",
        toolCall: {
          id: "call_456",
          function: {
            name: "save_restaurant_order",
            parameters: JSON.stringify({ restaurantId: 2, items: [] }),
          },
        },
      }],
    },
  });

  assert.equal(parsed.toolCallId, "call_456");
  assert.equal(parsed.orderPayload.restaurantId, 2);
});

test("keeps legacy direct order payloads compatible", () => {
  const body = { restaurantId: 1, customerName: "Phone Customer", items: [] };
  const parsed = parseOrderRequest(body);

  assert.equal(parsed.isVapiToolCall, false);
  assert.equal(parsed.toolCallId, null);
  assert.deepEqual(parsed.orderPayload, body);
});

test("builds the Vapi success response envelope", () => {
  assert.deepEqual(buildVapiSuccess("call_123", { success: true, orderId: 77 }), {
    results: [{
      toolCallId: "call_123",
      result: '{"success":true,"orderId":77}',
    }],
  });
});

test("builds a single-line Vapi error response envelope", () => {
  assert.deepEqual(buildVapiError("call_123", "Failed to\ncreate order"), {
    results: [{
      toolCallId: "call_123",
      error: "Failed to create order",
    }],
  });
});
