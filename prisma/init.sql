CREATE TABLE IF NOT EXISTS "Hotel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "websiteUrl" TEXT NOT NULL,
  "reviewToken" TEXT NOT NULL,
  "operatorToken" TEXT,
  "scrapedData" JSONB NOT NULL,
  "gapReport" JSONB NOT NULL,
  "missingFields" JSONB NOT NULL,
  "normalizedData" JSONB,
  "provenance" JSONB,
  "status" TEXT NOT NULL,
  "uploadedFiles" JSONB NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Hotel_reviewToken_key" ON "Hotel"("reviewToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Hotel_operatorToken_key" ON "Hotel"("operatorToken");
CREATE INDEX IF NOT EXISTS "Hotel_status_idx" ON "Hotel"("status");
