CREATE TABLE "service_documents" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_documents_kind_updated_at_idx" ON "service_documents"("kind", "updated_at");
