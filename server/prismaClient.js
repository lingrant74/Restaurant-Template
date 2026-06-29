const { PrismaClient } = require("@prisma/client");

// Create one Prisma client for the whole app so database connections are reused.
const prisma = new PrismaClient();

module.exports = prisma;
