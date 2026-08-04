-- Migration 0003: Engagement counters
-- Adds view_count, download_count, bookmark_count to the workflows table.
-- Purely additive — no existing columns or tables are modified.
-- Safe to run on any DB that has 0000, 0001, 0002 applied.

ALTER TABLE "workflows"
  ADD COLUMN IF NOT EXISTS "view_count"     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "download_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bookmark_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_views_idx"     ON "workflows" ("view_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflows_downloads_idx" ON "workflows" ("download_count");
