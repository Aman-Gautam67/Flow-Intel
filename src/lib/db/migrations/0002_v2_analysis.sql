-- Migration: 0002_v2_analysis
-- Adds three new tables for the FlowIntel v2 analysis engine.
-- Purely additive — no existing tables or columns are modified.
-- Safe to run on any database that has migrations 0000 and 0001 applied.

-- ─── Table: workflow_analysis_v2 ──────────────────────────────────────────────
-- One row per workflow_version. Stores the full v2 AnalysisReport broken into
-- queryable columns plus raw JSON blobs for the rich data.
CREATE TABLE "workflow_analysis_v2" (
  "id"               varchar(128) PRIMARY KEY,
  "version_id"       varchar(128) NOT NULL UNIQUE
                       REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
  "fingerprint_hash" varchar(64),

  -- Overall FQI score (0-100, weighted, N/A-aware)
  "fqi_score"        integer,

  -- 10 v2 category scores (NULL = N/A — category not applicable to this workflow)
  "score_security"          integer,
  "score_reliability"       integer,
  "score_idempotency"       integer,
  "score_observability"     integer,
  "score_maintainability"   integer,
  "score_performance"       integer,
  "score_compatibility"     integer,
  "score_privacy"           integer,
  "score_documentation"     integer,
  "score_cost_optimization" integer,

  -- Quality Gate results (true = PASS, false = FAIL, NULL = not evaluated)
  "gate_security_passed"     boolean,
  "gate_reliability_passed"  boolean,
  "gate_marketplace_passed"  boolean,
  "gate_production_passed"   boolean,
  "gate_enterprise_passed"   boolean,

  -- Full JSON blobs (used by UI + API, not for DB-level filtering)
  "findings"       json NOT NULL DEFAULT '[]'::json,
  "quality_gates"  json NOT NULL DEFAULT '[]'::json,
  "category_scores" json NOT NULL DEFAULT '[]'::json,

  "analysed_at"    timestamp NOT NULL DEFAULT NOW(),
  "updated_at"     timestamp NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX "wav2_version_idx"     ON "workflow_analysis_v2" ("version_id");
--> statement-breakpoint
CREATE INDEX "wav2_fqi_idx"         ON "workflow_analysis_v2" ("fqi_score");
--> statement-breakpoint
CREATE INDEX "wav2_fingerprint_idx" ON "workflow_analysis_v2" ("fingerprint_hash");
--> statement-breakpoint
CREATE INDEX "wav2_marketplace_idx" ON "workflow_analysis_v2" ("gate_marketplace_passed");
--> statement-breakpoint
CREATE INDEX "wav2_production_idx"  ON "workflow_analysis_v2" ("gate_production_passed");

-- ─── Table: workflow_certificates ─────────────────────────────────────────────
-- Immutable certificate records. Once issued, never modified.
-- certificate_id is the human-readable CERT-YYYYMMHHMM-XXXXXXXX identifier.
CREATE TABLE "workflow_certificates" (
  "certificate_id"       varchar(128) PRIMARY KEY,
  "version_id"           varchar(128) NOT NULL
                           REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
  "workflow_id"          varchar(128) NOT NULL
                           REFERENCES "workflows"("id") ON DELETE CASCADE,
  "fingerprint"          varchar(64) NOT NULL,
  "verification_hash"    varchar(64) NOT NULL,
  "passed_gates"         json NOT NULL DEFAULT '[]'::json,
  "findings_summary"     json NOT NULL DEFAULT '{}'::json,
  "category_scores"      json NOT NULL DEFAULT '{}'::json,
  "audit_date"           timestamp NOT NULL DEFAULT NOW(),
  "valid"                boolean NOT NULL DEFAULT true,
  "certification_version" varchar(32) NOT NULL DEFAULT '2.0.0'
);
--> statement-breakpoint
CREATE INDEX "wc_workflow_idx"    ON "workflow_certificates" ("workflow_id");
--> statement-breakpoint
CREATE INDEX "wc_fingerprint_idx" ON "workflow_certificates" ("fingerprint");
--> statement-breakpoint
CREATE INDEX "wc_valid_idx"       ON "workflow_certificates" ("valid");

-- ─── Table: workflow_passports ────────────────────────────────────────────────
-- One row per workflow (not per version). Updated on each re-analysis.
-- Tracks the workflow's permanent identity and marketplace status.
CREATE TABLE "workflow_passports" (
  "workflow_id"         varchar(128) PRIMARY KEY
                          REFERENCES "workflows"("id") ON DELETE CASCADE,
  "fingerprint_hash"    varchar(64),
  "workflow_name"       text,
  "platform"            varchar(32),
  "analysis_version"    integer NOT NULL DEFAULT 1,
  "marketplace_status"  varchar(32) NOT NULL DEFAULT 'NOT_SUBMITTED',
  "first_analysed_at"   timestamp NOT NULL DEFAULT NOW(),
  "last_analysed_at"    timestamp NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX "wp_fingerprint_idx"   ON "workflow_passports" ("fingerprint_hash");
--> statement-breakpoint
CREATE INDEX "wp_marketplace_idx"   ON "workflow_passports" ("marketplace_status");
