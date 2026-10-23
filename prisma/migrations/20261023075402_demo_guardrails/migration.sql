-- CreateEnum
CREATE TYPE "DemoRunStatus" AS ENUM ('RUNNING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "seedState" JSONB,
ADD COLUMN     "visitorId" TEXT;

-- CreateTable
CREATE TABLE "DemoVisitor" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRun" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "DemoRunStatus" NOT NULL DEFAULT 'RUNNING',
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoVisitor_ipHash_idx" ON "DemoVisitor"("ipHash");

-- CreateIndex
CREATE INDEX "DemoVisitor_lastSeen_idx" ON "DemoVisitor"("lastSeen");

-- CreateIndex
CREATE INDEX "DemoRun_startedAt_idx" ON "DemoRun"("startedAt");

-- CreateIndex
CREATE INDEX "DemoRun_visitorId_startedAt_idx" ON "DemoRun"("visitorId", "startedAt");

-- CreateIndex
CREATE INDEX "DemoRun_ipHash_startedAt_idx" ON "DemoRun"("ipHash", "startedAt");

-- CreateIndex
CREATE INDEX "DemoRun_ticketId_status_idx" ON "DemoRun"("ticketId", "status");

-- CreateIndex
CREATE INDEX "Ticket_visitorId_idx" ON "Ticket"("visitorId");

-- AddForeignKey
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DemoVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
