// Small shared helpers for the data layer.

// Timestamps are stored as ISO strings, matching how Prisma DateTime fields
// serialized to JSON (e.g. "2026-06-30T05:27:00.000Z").
function nowIso() {
  return new Date().toISOString();
}

// Money is stored as a fixed 2-decimal string, matching how Prisma's
// Decimal(10,2) columns serialized to JSON. Callers do Number(value) when they
// need arithmetic, so keeping strings preserves the existing API contract.
function toMoneyString(value, fallback = "0.00") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

// Normalizes a value that may be a Date into an ISO string, leaving everything
// else untouched. Used when route code passes `new Date()` into updates.
function toIsoIfDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = { nowIso, toMoneyString, toIsoIfDate };
