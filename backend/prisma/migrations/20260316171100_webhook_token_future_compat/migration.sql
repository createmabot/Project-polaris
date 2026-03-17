-- AlterTable
ALTER TABLE "webhook_tokens" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tokenHash" TEXT;
