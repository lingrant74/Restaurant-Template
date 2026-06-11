ALTER TABLE "Order" ADD COLUMN "customerEmail" TEXT;

ALTER TABLE "Order" RENAME COLUMN "subtotal" TO "total";

UPDATE "Order"
SET "status" = UPPER("status");

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
