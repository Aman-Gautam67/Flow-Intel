/**
 * Rule Pack Index — registers all built-in rule packs into the global registry.
 *
 * Import this module once (in analysis-runner.ts) to bootstrap the engine.
 * New rule packs: create the pack file and add one line here.
 */

import { registry } from "../registry";
import { SECURITY_PACK } from "./security.rules";
import { RELIABILITY_PACK } from "./reliability.rules";
import { IDEMPOTENCY_PACK } from "./idempotency.rules";
import { OBSERVABILITY_PACK } from "./observability.rules";
import { MAINTAINABILITY_PACK } from "./maintainability.rules";
import { PERFORMANCE_PACK } from "./performance.rules";
import { COMPATIBILITY_PACK } from "./compatibility.rules";
import { PRIVACY_PACK } from "./privacy.rules";
import { DOCUMENTATION_PACK } from "./documentation.rules";
import { COST_OPTIMIZATION_PACK } from "./cost-optimization.rules";
import { CONTROL_FLOW_PACK } from "./control-flow.rules";
import { SECURITY_EXT_A } from "./security-ext-a.rules";
import { SECURITY_EXT_B } from "./security-ext-b.rules";
import { RELIABILITY_EXT_A } from "./reliability-ext-a.rules";
import { RELIABILITY_EXT_B } from "./reliability-ext-b.rules";
import { IDEMPOTENCY_EXT } from "./idempotency-ext.rules";
import { OBSERVABILITY_EXT } from "./observability-ext.rules";
import { MAINTAINABILITY_EXT_A } from "./maintainability-ext-a.rules";
import { MAINTAINABILITY_EXT_B } from "./maintainability-ext-b.rules";
import { PERFORMANCE_EXT_A } from "./performance-ext-a.rules";
import { PERFORMANCE_EXT_B } from "./performance-ext-b.rules";
import { COMPATIBILITY_EXT_A } from "./compatibility-ext-a.rules";
import { COMPATIBILITY_EXT_B } from "./compatibility-ext-b.rules";
import { PRIVACY_EXT_A } from "./privacy-ext-a.rules";
import { PRIVACY_EXT_B } from "./privacy-ext-b.rules";
import { DOCUMENTATION_EXT } from "./documentation-ext.rules";
import { COST_OPTIMIZATION_EXT } from "./cost-optimization-ext.rules";

let registered = false;

/**
 * Register all built-in rule packs. Safe to call multiple times — idempotent.
 */
export function registerAllPacks(): void {
  if (registered) return;
  registered = true;

  registry.registerPack(SECURITY_PACK);
  registry.registerPack(RELIABILITY_PACK);
  registry.registerPack(IDEMPOTENCY_PACK);
  registry.registerPack(OBSERVABILITY_PACK);
  registry.registerPack(MAINTAINABILITY_PACK);
  registry.registerPack(PERFORMANCE_PACK);
  registry.registerPack(COMPATIBILITY_PACK);
  registry.registerPack(PRIVACY_PACK);
  registry.registerPack(DOCUMENTATION_PACK);
  registry.registerPack(COST_OPTIMIZATION_PACK);
  registry.registerPack(CONTROL_FLOW_PACK);

  registry.registerPack(SECURITY_EXT_A);
  registry.registerPack(SECURITY_EXT_B);
  registry.registerPack(RELIABILITY_EXT_A);
  registry.registerPack(RELIABILITY_EXT_B);
  registry.registerPack(IDEMPOTENCY_EXT);
  registry.registerPack(OBSERVABILITY_EXT);
  registry.registerPack(MAINTAINABILITY_EXT_A);
  registry.registerPack(MAINTAINABILITY_EXT_B);
  registry.registerPack(PERFORMANCE_EXT_A);
  registry.registerPack(PERFORMANCE_EXT_B);
  registry.registerPack(COMPATIBILITY_EXT_A);
  registry.registerPack(COMPATIBILITY_EXT_B);
  registry.registerPack(PRIVACY_EXT_A);
  registry.registerPack(PRIVACY_EXT_B);
  registry.registerPack(DOCUMENTATION_EXT);
  registry.registerPack(COST_OPTIMIZATION_EXT);
}

export {
  SECURITY_PACK,
  RELIABILITY_PACK,
  IDEMPOTENCY_PACK,
  OBSERVABILITY_PACK,
  MAINTAINABILITY_PACK,
  PERFORMANCE_PACK,
  COMPATIBILITY_PACK,
  PRIVACY_PACK,
  DOCUMENTATION_PACK,
  COST_OPTIMIZATION_PACK,
  CONTROL_FLOW_PACK,
  SECURITY_EXT_A,
  SECURITY_EXT_B,
  RELIABILITY_EXT_A,
  RELIABILITY_EXT_B,
  IDEMPOTENCY_EXT,
  OBSERVABILITY_EXT,
  MAINTAINABILITY_EXT_A,
  MAINTAINABILITY_EXT_B,
  PERFORMANCE_EXT_A,
  PERFORMANCE_EXT_B,
  COMPATIBILITY_EXT_A,
  COMPATIBILITY_EXT_B,
  PRIVACY_EXT_A,
  PRIVACY_EXT_B,
  DOCUMENTATION_EXT,
  COST_OPTIMIZATION_EXT,
};
