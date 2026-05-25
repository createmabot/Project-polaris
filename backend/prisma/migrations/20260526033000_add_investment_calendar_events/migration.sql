CREATE TABLE "investment_calendar_events" (
    "id" TEXT NOT NULL,
    "symbol_id" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "event_time" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "importance" TEXT NOT NULL DEFAULT 'medium',
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_name" TEXT,
    "source_label" TEXT,
    "source_url" TEXT,
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "investment_calendar_events_symbol_id_event_date_idx" ON "investment_calendar_events"("symbol_id", "event_date");
CREATE INDEX "investment_calendar_events_event_date_idx" ON "investment_calendar_events"("event_date");
CREATE INDEX "investment_calendar_events_event_type_event_date_idx" ON "investment_calendar_events"("event_type", "event_date");
CREATE INDEX "investment_calendar_events_status_event_date_idx" ON "investment_calendar_events"("status", "event_date");
CREATE UNIQUE INDEX "investment_calendar_events_source_type_external_id_key" ON "investment_calendar_events"("source_type", "external_id");

ALTER TABLE "investment_calendar_events" ADD CONSTRAINT "investment_calendar_events_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
