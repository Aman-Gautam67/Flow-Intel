import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const platformEnum = pgEnum("platform", [
  "N8N", "MAKE", "ZAPIER", "FLOWISE", "LANGFLOW",
  "AIRFLOW", "PREFECT", "DAGSTER", "GENERIC",
  "NODE_RED", "ACTIVEPIECES",
  "DIFY", "CREWAI", "AUTOGEN", "PIPEDREAM", "OPENAI_AGENTS",
  "POWER_AUTOMATE",
]);

// ─── Workflows ────────────────────────────────────────────────────────────────
export const workflows = pgTable(
  "workflows",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    slug: varchar("slug", { length: 256 }).notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    platform: platformEnum("platform").notNull().default("N8N"),
    isPublic: boolean("is_public").notNull().default(true),
    authorId: varchar("author_id", { length: 128 }).references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // ── Engagement counters (added migration 0003) ───────────────────────────
    viewCount:      integer("view_count").notNull().default(0),
    downloadCount:  integer("download_count").notNull().default(0),
    bookmarkCount:  integer("bookmark_count").notNull().default(0),
  },
  (t) => ({
    slugIdx: uniqueIndex("workflows_slug_idx").on(t.slug),
    authorIdx: index("workflows_author_idx").on(t.authorId),
    publicIdx: index("workflows_public_idx").on(t.isPublic),
    platformIdx: index("workflows_platform_idx").on(t.platform),
    viewsIdx: index("workflows_views_idx").on(t.viewCount),
    downloadsIdx: index("workflows_downloads_idx").on(t.downloadCount),
  })
);

export type Workflow = InferSelectModel<typeof workflows>;

// ─── Workflow Versions ────────────────────────────────────────────────────────
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workflowId: varchar("workflow_id", { length: 128 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
    versionNum: integer("version_num").notNull().default(1),
    rawJson: json("raw_json").notNull(),
    nodeCount: integer("node_count").notNull().default(0),
    triggerType: varchar("trigger_type", { length: 256 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx: index("wv_workflow_idx").on(t.workflowId),
    versionIdx: index("wv_version_idx").on(t.workflowId, t.versionNum),
  })
);

export type WorkflowVersion = InferSelectModel<typeof workflowVersions>;

// ─── Workflow Scores ──────────────────────────────────────────────────────────
export const workflowScores = pgTable(
  "workflow_scores",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    versionId: varchar("version_id", { length: 128 }).notNull().unique().references(() => workflowVersions.id, { onDelete: "cascade" }),
    healthScore: integer("health_score").notNull().default(100),
    securityScore: integer("security_score").notNull().default(100),
    complexityScore: integer("complexity_score").notNull().default(0),
    reliabilityScore: integer("reliability_score").notNull().default(100),
    debtScore: integer("debt_score").notNull().default(100),
    memoryScore: integer("memory_score").notNull().default(100),
    resilienceScore: integer("resilience_score").notNull().default(100),
    privacyScore: integer("privacy_score").notNull().default(100),
    aiGuardrailsScore: integer("ai_guardrails_score"),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    securityFlags: json("security_flags").notNull().default([]),
    resilienceFlags: json("resilience_flags").notNull().default([]),
    memoryProfile: json("memory_profile").notNull().default({}),
    debtProfile: json("debt_profile").notNull().default({}),
    privacyProfile: json("privacy_profile").notNull().default({}),
    remediationSteps: json("remediation_steps").notNull().default([]),
    allFlags: json("all_flags").notNull().default([]),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    versionIdx: uniqueIndex("ws_version_idx").on(t.versionId),
    securityIdx: index("ws_security_idx").on(t.securityScore),
    healthIdx: index("ws_health_idx").on(t.healthScore),
  })
);

export type WorkflowScore = InferSelectModel<typeof workflowScores>;

// ─── Dependencies ─────────────────────────────────────────────────────────────
export const dependencies = pgTable(
  "dependencies",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    workflowId: varchar("workflow_id", { length: 128 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
    serviceName: varchar("service_name", { length: 256 }).notNull(),
    category: varchar("category", { length: 128 }).notNull(),
    isAi: boolean("is_ai").notNull().default(false),
    vendorType: varchar("vendor_type", { length: 32 }).notNull().default("saas"),
  },
  (t) => ({
    workflowIdx: index("dep_workflow_idx").on(t.workflowId),
    serviceIdx: index("dep_service_idx").on(t.serviceName),
  })
);

export type Dependency = InferSelectModel<typeof dependencies>;

// ─── Tags ─────────────────────────────────────────────────────────────────────
export const tags = pgTable("tags", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
});

export const workflowTags = pgTable(
  "workflow_tags",
  {
    workflowId: varchar("workflow_id", { length: 128 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 128 }).notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("wt_pk").on(t.workflowId, t.tagId),
  })
);

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = pgTable("categories", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
});

export const workflowCategories = pgTable(
  "workflow_categories",
  {
    workflowId: varchar("workflow_id", { length: 128 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 128 }).notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("wc_pk").on(t.workflowId, t.categoryId),
  })
);

// ─── V2 Analysis Results ──────────────────────────────────────────────────────
export const workflowAnalysisV2 = pgTable(
  "workflow_analysis_v2",
  {
    id:         varchar("id", { length: 128 }).primaryKey(),
    versionId:  varchar("version_id", { length: 128 }).notNull().unique().references(() => workflowVersions.id, { onDelete: "cascade" }),
    fingerprintHash: varchar("fingerprint_hash", { length: 64 }),

    fqiScore: integer("fqi_score"),

    // 10 v2 category scores (null = N/A)
    scoreSecurity:        integer("score_security"),
    scoreReliability:     integer("score_reliability"),
    scoreIdempotency:     integer("score_idempotency"),
    scoreObservability:   integer("score_observability"),
    scoreMaintainability: integer("score_maintainability"),
    scorePerformance:     integer("score_performance"),
    scoreCompatibility:   integer("score_compatibility"),
    scorePrivacy:         integer("score_privacy"),
    scoreDocumentation:   integer("score_documentation"),
    scoreCostOptimization: integer("score_cost_optimization"),

    // Quality Gate booleans (null = not evaluated)
    gateSecurityPassed:    boolean("gate_security_passed"),
    gateReliabilityPassed: boolean("gate_reliability_passed"),
    gateMarketplacePassed: boolean("gate_marketplace_passed"),
    gateProductionPassed:  boolean("gate_production_passed"),
    gateEnterprisePassed:  boolean("gate_enterprise_passed"),

    // Full JSON blobs
    findings:       json("findings").notNull().default([]),
    qualityGates:   json("quality_gates").notNull().default([]),
    categoryScores: json("category_scores").notNull().default([]),

    analysedAt: timestamp("analysed_at").notNull().defaultNow(),
    updatedAt:  timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    versionIdx:     uniqueIndex("wav2_version_idx").on(t.versionId),
    fqiIdx:         index("wav2_fqi_idx").on(t.fqiScore),
    fingerprintIdx: index("wav2_fingerprint_idx").on(t.fingerprintHash),
    marketplaceIdx: index("wav2_marketplace_idx").on(t.gateMarketplacePassed),
    productionIdx:  index("wav2_production_idx").on(t.gateProductionPassed),
  })
);

export type WorkflowAnalysisV2 = InferSelectModel<typeof workflowAnalysisV2>;

// ─── Workflow Certificates ────────────────────────────────────────────────────
export const workflowCertificates = pgTable(
  "workflow_certificates",
  {
    certificateId:       varchar("certificate_id", { length: 128 }).primaryKey(),
    versionId:           varchar("version_id", { length: 128 }).notNull().references(() => workflowVersions.id, { onDelete: "cascade" }),
    workflowId:          varchar("workflow_id", { length: 128 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
    fingerprint:         varchar("fingerprint", { length: 64 }).notNull(),
    verificationHash:    varchar("verification_hash", { length: 64 }).notNull(),
    passedGates:         json("passed_gates").notNull().default([]),
    findingsSummary:     json("findings_summary").notNull().default({}),
    categoryScores:      json("category_scores").notNull().default({}),
    auditDate:           timestamp("audit_date").notNull().defaultNow(),
    valid:               boolean("valid").notNull().default(true),
    certificationVersion: varchar("certification_version", { length: 32 }).notNull().default("2.0.0"),
  },
  (t) => ({
    workflowIdx:    index("wcert_workflow_idx").on(t.workflowId),
    fingerprintIdx: index("wcert_fingerprint_idx").on(t.fingerprint),
    validIdx:       index("wcert_valid_idx").on(t.valid),
  })
);

export type WorkflowCertificate = InferSelectModel<typeof workflowCertificates>;

// ─── Workflow Passports ───────────────────────────────────────────────────────
export const workflowPassports = pgTable(
  "workflow_passports",
  {
    workflowId:        varchar("workflow_id", { length: 128 }).primaryKey().references(() => workflows.id, { onDelete: "cascade" }),
    fingerprintHash:   varchar("fingerprint_hash", { length: 64 }),
    workflowName:      text("workflow_name"),
    platform:          varchar("platform", { length: 32 }),
    analysisVersion:   integer("analysis_version").notNull().default(1),
    marketplaceStatus: varchar("marketplace_status", { length: 32 }).notNull().default("NOT_SUBMITTED"),
    firstAnalysedAt:   timestamp("first_analysed_at").notNull().defaultNow(),
    lastAnalysedAt:    timestamp("last_analysed_at").notNull().defaultNow(),
  },
  (t) => ({
    fingerprintIdx:   index("wp_fingerprint_idx").on(t.fingerprintHash),
    marketplaceIdx:   index("wp_marketplace_idx").on(t.marketplaceStatus),
  })
);

export type WorkflowPassportRow = InferSelectModel<typeof workflowPassports>;

