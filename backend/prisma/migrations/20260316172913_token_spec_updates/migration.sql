-- AlterTable
ALTER TABLE "webhook_tokens" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'tradingview',
ADD COLUMN     "rotatedAt" TIMESTAMP(3),
ADD COLUMN     "sharedSecretHash" TEXT;
