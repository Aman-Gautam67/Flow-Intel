/**
 * Rule Pack Index — registers all built-in rule packs into the global registry.
 *
 * Import this module once (in analysis-runner.ts) to bootstrap the engine.
 * New rule packs: create the pack file and add one line here.
 */

import { registry } from "../registry";
import { SECURITY_PACK }         from "./security.rules";
import { RELIABILITY_PACK }      from "./reliability.rules";
import { IDEMPOTENCY_PACK }      from "./idempotency.rules";
import { OBSERVABILITY_PACK }    from "./observability.rules";
import { MAINTAINABILITY_PACK }  from "./maintainability.rules";
import { PERFORMANCE_PACK }      from "./performance.rules";
import { COMPATIBILITY_PACK }    from "./compatibility.rules";
import { PRIVACY_PACK }          from "./privacy.rules";
import { DOCUMENTATION_PACK }    from "./documentation.rules";
import { COST_OPTIMIZATION_PACK } from "./cost-optimization.rules";

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
};
