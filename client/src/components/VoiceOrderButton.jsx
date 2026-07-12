import { useCallback, useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

// Public (browser-safe) Vapi key and the voice assistant to dial. Both are read
// from Vite env vars so they can differ per environment; the assistant id falls
// back to the shared demo assistant if none is configured.
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";
const DEFAULT_ASSISTANT_ID =
  import.meta.env.VITE_VAPI_ASSISTANT_ID || "abdd479b-efe9-445f-b081-3631b74c4012";

// Call lifecycle states used to drive the button label and styling.
const IDLE = "idle";
const CONNECTING = "connecting";
const ACTIVE = "active";

export default function VoiceOrderButton({ assistantId = DEFAULT_ASSISTANT_ID, restaurant }) {
  const vapiRef = useRef(null);
  const [status, setStatus] = useState(IDLE);

  // Create the Vapi client once and wire up call lifecycle listeners. The
  // instance is torn down on unmount so an in-progress call never leaks.
  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) {
      return undefined;
    }

    const vapi = new Vapi(VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on("call-start", () => setStatus(ACTIVE));
    vapi.on("call-end", () => setStatus(IDLE));
    vapi.on("error", (err) => {
      console.error("Vapi error:", err);
      setStatus(IDLE);
    });

    return () => {
      try {
        vapi.stop();
      } catch {
        // Ignore teardown errors when no call is active.
      }
      vapi.removeAllListeners?.();
      vapiRef.current = null;
    };
  }, []);

  const startCall = useCallback(async () => {
    const vapi = vapiRef.current;
    if (!vapi) {
      return;
    }

    setStatus(CONNECTING);

    try {
      // Pass the current restaurant to the assistant so it can look up the
      // right menu and attach orders to the correct restaurant.
      const overrides = restaurant
        ? {
            variableValues: {
              restaurantId: restaurant.id,
              restaurantName: restaurant.name
            }
          }
        : undefined;

      await vapi.start(assistantId, overrides);
    } catch (err) {
      console.error("Failed to start Vapi call:", err);
      setStatus(IDLE);
    }
  }, [assistantId, restaurant]);

  const stopCall = useCallback(() => {
    vapiRef.current?.stop();
  }, []);

  // Without a public key the widget cannot connect, so keep it hidden rather
  // than showing a button that always errors.
  if (!VAPI_PUBLIC_KEY) {
    return null;
  }

  const isBusy = status === ACTIVE || status === CONNECTING;

  return (
    <button
      type="button"
      className={`voice-order-button ${isBusy ? "is-active" : ""}`}
      onClick={isBusy ? stopCall : startCall}
      disabled={status === CONNECTING}
      aria-label={isBusy ? "End voice order call" : "Start a voice order"}
    >
      <span className="voice-order-icon" aria-hidden="true">
        {isBusy ? "■" : "🎙️"}
      </span>
      {status === CONNECTING ? "Connecting..." : status === ACTIVE ? "End call" : "Order by voice"}
    </button>
  );
}
