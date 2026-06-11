-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "themeColor" TEXT NOT NULL DEFAULT '#d62828';
