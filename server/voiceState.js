// In-memory call state keyed by Twilio CallSid.
// Each entry holds the pending order for an active phone call.

const callStates = new Map();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getState(callSid) {
  const entry = callStates.get(callSid);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    callStates.delete(callSid);
    return null;
  }
  return entry;
}

function setState(callSid, state) {
  state.createdAt = state.createdAt || Date.now();
  callStates.set(callSid, state);
}

function clearState(callSid) {
  callStates.delete(callSid);
}

// Clean up expired entries every 5 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [sid, state] of callStates) {
    if (now - state.createdAt > STATE_TTL_MS) {
      callStates.delete(sid);
    }
  }
}, 5 * 60 * 1000);

module.exports = { getState, setState, clearState };
