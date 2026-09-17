-- Additive only: nothing existing is dropped or rewritten.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "imagePathname" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "invoiceNumber" TEXT;

-- CreateIndex
CREATE INDEX "Sale_invoiceNumber_idx" ON "Sale"("invoiceNumber");
