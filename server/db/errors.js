// Data-layer errors. These replace the Prisma error codes the routes used to
// catch (P2025 -> NOT_FOUND, P2002 -> UNIQUE) so route handlers can keep
// returning the same 404 / 409 responses.

class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
    this.code = "NOT_FOUND";
  }
}

class UniqueConstraintError extends Error {
  // `target` mirrors Prisma's err.meta.target so callers can tailor the message
  // (e.g. distinguish a duplicate slug from a duplicate email).
  constructor(target) {
    super("Unique constraint violation");
    this.name = "UniqueConstraintError";
    this.code = "UNIQUE";
    this.target = Array.isArray(target) ? target : [target];
  }
}

module.exports = { NotFoundError, UniqueConstraintError };
