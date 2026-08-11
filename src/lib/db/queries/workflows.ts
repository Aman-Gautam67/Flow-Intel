import { and, desc, eq, gte, ilike, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  workflows,
  workflowVersions,
  workflowScores,
  workflowAnalysisV2,
  workflowCertificates,
  workflowPassports,
  dependencies,
  workflowTags,
  workflowCategories,
  tags,
  categories,
} from "@/lib/db/schema";
import type { AuditFlag, ScoreBreakdown, SearchParams, Platform } from "@/types";
import type { AnalysisReport, Certificate, CategoryScore } from "@/lib/engine/types";
import { nanoid } from "nanoid";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeUniqueSlug(name: string): string {
  return `${slugify(name)}-${nanoid(6)}`;
}

// ─── Create workflow + version + scores atomically ───────────────────────────
export async function createWorkflowWithAnalysis(params: {
  title: string;
  description?: string;
  platform?: Platform;
  isPublic?: boolean;
  authorId?: string;
  rawJson: unknown;
  nodeCount: number;
  triggerType?: string;
  scores: ScoreBreakdown;
  deps: Array<{ serviceName: string; category: string; isAi: boolean; vendorType?: string }>;
  tagNames?: string[];
  categoryNames?: string[];
}) {
  const id = nanoid();
  const slug = makeUniqueSlug(params.title);
  const versionId = nanoid();
  const scoreId = nanoid();

  await db.transaction(async (tx) => {
    // Workflow
    await tx.insert(workflows).values({
      id,
      slug,
      title: params.title,
      description: params.description ?? null,
      platform: params.platform ?? "N8N",
      isPublic: params.isPublic ?? true,
      authorId: params.authorId ?? null,
    });

    // Version
    await tx.insert(workflowVersions).values({
      id: versionId,
      workflowId: id,
      versionNum: 1,
      rawJson: params.rawJson as Record<string, unknown>,
      nodeCount: params.nodeCount,
      triggerType: params.triggerType ?? null,
    });

    // Scores
    const s = params.scores;
    await tx.insert(workflowScores).values({
      id: scoreId,
      versionId,
      healthScore: s.healthScore,
      securityScore: s.securityScore     ?? 100,
      complexityScore: s.complexityScore,
      reliabilityScore: s.reliabilityScore,
      debtScore: s.debtScore,
      memoryScore: s.memoryScore,
      resilienceScore: s.resilienceScore,
      privacyScore: s.privacyScore,
      aiGuardrailsScore: s.aiGuardrailsScore,
      estimatedCostUsd: s.estimatedCostUsd,
      securityFlags: s.securityFlags as unknown as Record<string, unknown>[],
      resilienceFlags: s.resilienceFlags as unknown as Record<string, unknown>[],
      memoryProfile: s.memoryProfile as unknown as Record<string, unknown>,
      debtProfile: s.debtProfile as unknown as Record<string, unknown>,
      privacyProfile: s.privacyProfile as unknown as Record<string, unknown>,
      remediationSteps: s.remediationSteps as unknown as Record<string, unknown>[],
      allFlags: s.flags as unknown as Record<string, unknown>[],
    });

    // Dependencies
    if (params.deps.length > 0) {
      await tx.insert(dependencies).values(
        params.deps.map((d) => ({
          id: nanoid(),
          workflowId: id,
          serviceName: d.serviceName,
          category: d.category,
          isAi: d.isAi,
          vendorType: d.vendorType ?? "saas",
        }))
      );
    }

    // Tags
    if (params.tagNames && params.tagNames.length > 0) {
      for (const name of params.tagNames) {
        const existing = await tx.select().from(tags).where(eq(tags.name, name)).limit(1);
        const tagId = existing[0]?.id ?? nanoid();
        if (!existing[0]) await tx.insert(tags).values({ id: tagId, name });
        await tx.insert(workflowTags).values({ workflowId: id, tagId }).onConflictDoNothing();
      }
    }

    // Categories
    if (params.categoryNames && params.categoryNames.length > 0) {
      for (const name of params.categoryNames) {
        const catSlug = slugify(name);
        const existing = await tx.select().from(categories).where(eq(categories.name, name)).limit(1);
        const catId = existing[0]?.id ?? nanoid();
        if (!existing[0]) await tx.insert(categories).values({ id: catId, name, slug: catSlug });
        await tx.insert(workflowCategories).values({ workflowId: id, categoryId: catId }).onConflictDoNothing();
      }
    }
  });

  return { id, slug, versionId };
}

// ─── Get single workflow with scores ─────────────────────────────────────────
export async function getWorkflowBySlug(slug: string) {
  const wf = await db
    .select()
    .from(workflows)
    .where(eq(workflows.slug, slug))
    .limit(1);
  if (!wf[0]) return null;

  const versions = await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, wf[0].id))
    .orderBy(desc(workflowVersions.versionNum));

  const latestVersion = versions[0];
  if (!latestVersion) return { workflow: wf[0], version: null, scores: null, analysisV2: null, deps: [], versions };

  const [scoreRows, analysisV2Rows, deps] = await Promise.all([
    db.select().from(workflowScores).where(eq(workflowScores.versionId, latestVersion.id)).limit(1),
    db.select().from(workflowAnalysisV2).where(eq(workflowAnalysisV2.versionId, latestVersion.id)).limit(1),
    db.select().from(dependencies).where(eq(dependencies.workflowId, wf[0].id)),
  ]);

  return {
    workflow: wf[0],
    version: latestVersion,
    scores: scoreRows[0] ?? null,
    analysisV2: analysisV2Rows[0] ?? null,
    deps,
    versions,
  };
}

// ─── Search workflows ─────────────────────────────────────────────────────────
export async function searchWorkflows(params: SearchParams) {
  const limit = params.limit ?? 20;
  const offset = ((params.page ?? 1) - 1) * limit;

  const conditions = [eq(workflows.isPublic, true)];

  if (params.q) {
    conditions.push(
      or(
        ilike(workflows.title, `%${params.q}%`),
        ilike(workflows.description, `%${params.q}%`)
      )!
    );
  }
  if (params.platform) {
    conditions.push(eq(workflows.platform, params.platform));
  }

  // Join with scores for threshold filtering + v2 analysis for gate/fqi filters
  const rows = await db
    .select({
      workflow: workflows,
      version: workflowVersions,
      scores: workflowScores,
      analysisV2: workflowAnalysisV2,
    })
    .from(workflows)
    .leftJoin(workflowVersions, and(
      eq(workflowVersions.workflowId, workflows.id),
      eq(workflowVersions.versionNum, sql<number>`(
        SELECT MAX(v2.version_num)
        FROM workflow_versions v2
        WHERE v2.workflow_id = ${workflows.id}
      )`)
    ))
    .leftJoin(workflowScores, eq(workflowScores.versionId, workflowVersions.id))
    .leftJoin(workflowAnalysisV2, eq(workflowAnalysisV2.versionId, workflowVersions.id))
    .where(and(...conditions))
    .orderBy(desc(workflows.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch deps for all returned workflows in one query
  const workflowIds = rows.map((r) => r.workflow.id);
  const allDeps = workflowIds.length > 0
    ? await db.select().from(dependencies).where(
        workflowIds.length === 1
          ? eq(dependencies.workflowId, workflowIds[0]!)
          : or(...workflowIds.map((id) => eq(dependencies.workflowId, id)))!
      )
    : [];

  // Group deps by workflowId
  const depsByWorkflow: Record<string, Array<{ serviceName: string; category: string; isAi: boolean; vendorType: string }>> = {};
  for (const d of allDeps) {
    if (!depsByWorkflow[d.workflowId]) depsByWorkflow[d.workflowId] = [];
    depsByWorkflow[d.workflowId]!.push({ serviceName: d.serviceName, category: d.category, isAi: d.isAi, vendorType: d.vendorType });
  }

  // Attach deps to rows and apply all filters in memory
  const enriched = rows.map((r) => ({
    ...r,
    deps: depsByWorkflow[r.workflow.id] ?? [],
  }));

  return enriched.filter((r) => {
    const s = r.scores;
    const v2 = r.analysisV2;

    if (s) {
      if (params.healthMin !== undefined && s.healthScore < params.healthMin) return false;
      if (params.securityMin !== undefined && s.securityScore < params.securityMin) return false;
      if (params.complexityMin !== undefined && s.complexityScore < params.complexityMin) return false;
      if (params.complexityMax !== undefined && s.complexityScore > params.complexityMax) return false;

      // No CRIT flags — check allFlags JSON
      if (params.noCritFlags) {
        const flags = (s.allFlags ?? []) as unknown as AuditFlag[];
        if (flags.some((f) => f.severity === "CRITICAL")) return false;
      }

      // Production Ready: health ≥ 80, security ≥ 80, no CRIT flags
      if (params.productionReady) {
        if (s.healthScore < 80 || s.securityScore < 80) return false;
        const flags = (s.allFlags ?? []) as unknown as AuditFlag[];
        if (flags.some((f) => f.severity === "CRITICAL")) return false;
      }
    }

    // v2 engine filters
    if (params.certifiedOnly) {
      if (!v2 || !v2.gateMarketplacePassed || !v2.gateProductionPassed) return false;
    }
    if (params.fqiMin !== undefined) {
      if (!v2 || (v2.fqiScore ?? 0) < params.fqiMin) return false;
    }
    if (params.gateFilter) {
      const gateMap = {
        marketplace: v2?.gateMarketplacePassed,
        production:  v2?.gateProductionPassed,
        enterprise:  v2?.gateEnterprisePassed,
      };
      if (!gateMap[params.gateFilter]) return false;
    }

    // Has AI nodes — from deps
    if (params.hasAi) {
      if (!r.deps.some((d) => d.isAi)) return false;
    }

    return true;
  });
}

// ─── Get workflow version by id ───────────────────────────────────────────────
export async function getVersionWithScores(versionId: string) {
  const version = await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.id, versionId))
    .limit(1);
  if (!version[0]) return null;

  const scores = await db
    .select()
    .from(workflowScores)
    .where(eq(workflowScores.versionId, versionId))
    .limit(1);

  return { version: version[0], scores: scores[0] ?? null };
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getStats() {
  const [workflowCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workflows)
    .where(eq(workflows.isPublic, true));

  const [vulnCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workflowScores)
    .where(lte(workflowScores.securityScore, 60));

  const [integrationCount] = await db
    .select({ count: sql<number>`COUNT(DISTINCT service_name)` })
    .from(dependencies);

  return {
    workflowsAnalyzed: Number(workflowCount?.count ?? 0),
    vulnerabilitiesDetected: Number(vulnCount?.count ?? 0),
    integrationsIndexed: Number(integrationCount?.count ?? 0),
  };
}

// ─── V2 Analysis: Store ───────────────────────────────────────────────────────
/**
 * Persist a full v2 AnalysisReport for a specific workflow version.
 * Upserts: if a record already exists for this versionId it is replaced.
 */
export async function storeAnalysisReport(
  versionId: string,
  report: AnalysisReport
): Promise<void> {
  const id = nanoid();

  // Helper to extract a nullable category score
  const catScore = (label: string): number | null => {
    const cat = report.categoryScores.find((c) => c.category === label);
    return cat?.applicable ? cat.score : null;
  };

  const gateResult = (name: string): boolean | null => {
    const g = report.qualityGates.find((g) => g.gate === name);
    return g ? g.passed : null;
  };

  await db
    .insert(workflowAnalysisV2)
    .values({
      id,
      versionId,
      fingerprintHash: report.fingerprint?.hash ?? null,
      fqiScore: report.fqiScore,

      scoreSecurity:        catScore("SECURITY"),
      scoreReliability:     catScore("RELIABILITY"),
      scoreIdempotency:     catScore("IDEMPOTENCY"),
      scoreObservability:   catScore("OBSERVABILITY"),
      scoreMaintainability: catScore("MAINTAINABILITY"),
      scorePerformance:     catScore("PERFORMANCE"),
      scoreCompatibility:   catScore("COMPATIBILITY"),
      scorePrivacy:         catScore("PRIVACY"),
      scoreDocumentation:   catScore("DOCUMENTATION"),
      scoreCostOptimization: catScore("COST_OPTIMIZATION"),

      gateSecurityPassed:    gateResult("SECURITY_GATE"),
      gateReliabilityPassed: gateResult("RELIABILITY_GATE"),
      gateMarketplacePassed: gateResult("MARKETPLACE_GATE"),
      gateProductionPassed:  gateResult("PRODUCTION_GATE"),
      gateEnterprisePassed:  gateResult("ENTERPRISE_GATE"),

      findings:       report.findings as unknown as Record<string, unknown>[],
      qualityGates:   report.qualityGates as unknown as Record<string, unknown>[],
      categoryScores: report.categoryScores as unknown as Record<string, unknown>[],
    })
    .onConflictDoUpdate({
      target: workflowAnalysisV2.versionId,
      set: {
        fingerprintHash:      report.fingerprint?.hash ?? null,
        fqiScore:             report.fqiScore,
        scoreSecurity:        catScore("SECURITY"),
        scoreReliability:     catScore("RELIABILITY"),
        scoreIdempotency:     catScore("IDEMPOTENCY"),
        scoreObservability:   catScore("OBSERVABILITY"),
        scoreMaintainability: catScore("MAINTAINABILITY"),
        scorePerformance:     catScore("PERFORMANCE"),
        scoreCompatibility:   catScore("COMPATIBILITY"),
        scorePrivacy:         catScore("PRIVACY"),
        scoreDocumentation:   catScore("DOCUMENTATION"),
        scoreCostOptimization: catScore("COST_OPTIMIZATION"),
        gateSecurityPassed:    gateResult("SECURITY_GATE"),
        gateReliabilityPassed: gateResult("RELIABILITY_GATE"),
        gateMarketplacePassed: gateResult("MARKETPLACE_GATE"),
        gateProductionPassed:  gateResult("PRODUCTION_GATE"),
        gateEnterprisePassed:  gateResult("ENTERPRISE_GATE"),
        findings:       report.findings as unknown as Record<string, unknown>[],
        qualityGates:   report.qualityGates as unknown as Record<string, unknown>[],
        categoryScores: report.categoryScores as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      },
    });
}

// ─── V2 Analysis: Read ────────────────────────────────────────────────────────
export async function getAnalysisV2ByVersionId(versionId: string) {
  const rows = await db
    .select()
    .from(workflowAnalysisV2)
    .where(eq(workflowAnalysisV2.versionId, versionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAnalysisV2ByFingerprint(fingerprintHash: string) {
  const rows = await db
    .select()
    .from(workflowAnalysisV2)
    .where(eq(workflowAnalysisV2.fingerprintHash, fingerprintHash))
    .orderBy(desc(workflowAnalysisV2.analysedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Certificates: Store + Read ───────────────────────────────────────────────
export async function storeCertificate(
  workflowId: string,
  versionId: string,
  cert: Certificate
): Promise<void> {
  await db
    .insert(workflowCertificates)
    .values({
      certificateId:       cert.certificateId,
      versionId,
      workflowId,
      fingerprint:         cert.fingerprint,
      verificationHash:    cert.verificationHash,
      passedGates:         cert.passedGates as unknown as string[],
      findingsSummary:     cert.findingsSummary as unknown as Record<string, unknown>,
      categoryScores:      cert.categoryScores as unknown as Record<string, unknown>,
      auditDate:           new Date(cert.auditDate),
      valid:               cert.valid,
      certificationVersion: cert.certificationVersion,
    })
    .onConflictDoNothing(); // certificates are immutable — never update
}

export async function getCertificateById(certificateId: string) {
  const rows = await db
    .select()
    .from(workflowCertificates)
    .where(eq(workflowCertificates.certificateId, certificateId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Passports: Upsert + Read ─────────────────────────────────────────────────
export async function upsertPassport(
  workflowId: string,
  data: {
    fingerprintHash?: string;
    workflowName?: string;
    platform?: string;
    marketplaceStatus?: string;
  }
): Promise<void> {
  await db
    .insert(workflowPassports)
    .values({
      workflowId,
      fingerprintHash:   data.fingerprintHash ?? null,
      workflowName:      data.workflowName ?? null,
      platform:          data.platform ?? null,
      analysisVersion:   1,
      marketplaceStatus: data.marketplaceStatus ?? "NOT_SUBMITTED",
    })
    .onConflictDoUpdate({
      target: workflowPassports.workflowId,
      set: {
        fingerprintHash:   data.fingerprintHash ?? null,
        workflowName:      data.workflowName ?? null,
        platform:          data.platform ?? null,
        marketplaceStatus: data.marketplaceStatus ?? "NOT_SUBMITTED",
        analysisVersion:   sql`${workflowPassports.analysisVersion} + 1`,
        lastAnalysedAt:    new Date(),
      },
    });
}

export async function getPassportByWorkflowId(workflowId: string) {
  const rows = await db
    .select()
    .from(workflowPassports)
    .where(eq(workflowPassports.workflowId, workflowId))
    .limit(1);
  return rows[0] ?? null;
}
