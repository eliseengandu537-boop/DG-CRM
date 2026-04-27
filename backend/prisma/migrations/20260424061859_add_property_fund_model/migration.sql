-- CreateTable
CREATE TABLE "PropertyFund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT,
    "regNumber" TEXT,
    "listed" BOOLEAN NOT NULL,
    "overview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyFund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyFund_listed_idx" ON "PropertyFund"("listed");

-- CreateIndex
CREATE INDEX "PropertyFund_name_idx" ON "PropertyFund"("name");
