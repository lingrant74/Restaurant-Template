function parseToolArguments(value) {
  if (typeof value !== "string") {
    return value && typeof value === "object" ? value : {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Vapi sends server-side Function Tool calls inside a `message.toolCallList`
// envelope. Keep accepting the older direct payload as well so local curl
// requests and any existing integrations do not break.
function parseOrderRequest(body = {}) {
  const message = body.message;

  if (!message || message.type !== "tool-calls") {
    return {
      isVapiToolCall: false,
      toolCallId: null,
      toolName: null,
      orderPayload: body,
    };
  }

  const toolCall = message.toolCallList?.[0] || null;
  const toolWithToolCall = message.toolWithToolCallList?.[0] || null;
  const nestedToolCall = toolWithToolCall?.toolCall || null;
  const toolCallId = toolCall?.id || nestedToolCall?.id || null;
  const toolName = toolCall?.name || nestedToolCall?.function?.name || toolWithToolCall?.name || null;
  const rawArguments =
    toolCall?.arguments ??
    toolCall?.parameters ??
    toolCall?.function?.arguments ??
    toolCall?.function?.parameters ??
    nestedToolCall?.arguments ??
    nestedToolCall?.parameters ??
    nestedToolCall?.function?.arguments ??
    nestedToolCall?.function?.parameters;

  return {
    isVapiToolCall: true,
    toolCallId,
    toolName,
    orderPayload: parseToolArguments(rawArguments),
  };
}

function buildVapiSuccess(toolCallId, result) {
  return {
    results: [{
      toolCallId,
      // Vapi's troubleshooting guidance recommends a single-line string here.
      result: JSON.stringify(result),
    }],
  };
}

function buildVapiError(toolCallId, message) {
  return {
    results: [{
      toolCallId,
      error: String(message || "Failed to create order").replace(/\s+/g, " ").trim(),
    }],
  };
}

module.exports = { parseOrderRequest, buildVapiSuccess, buildVapiError };
