/**
 * FlowIntel Rule Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Central registry for all rule definitions.
 * Rules register themselves; no core engine modification needed for new rules.
 *
 * Design:
 *  - Backed by a Map<ruleId, RuleDefinition>
 *  - Rule IDs are permanent — never rename after publication
 *  - Duplicate ID registration throws at load time (fail fast)
 *  - Rule packs call `registry.register(pack)` at module init
 */

import type { RuleDefinition, RuleCategory, RulePackManifest } from "./types";

class RuleRegistry {
  private readonly rules = new Map<string, RuleDefinition>();
  private readonly packManifests = new Map<string, RulePackManifest>();

  /**
   * Register a single rule definition.
   * Throws if a rule with the same ID is already registered.
   */
  register(rule: RuleDefinition): void {
    if (this.rules.has(rule.id)) {
      throw new Error(
        `[RuleRegistry] Duplicate rule ID "${rule.id}". Rule IDs are permanent — ` +
        `rename the new rule or deregister the existing one first.`
      );
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Register all rules in a RulePackManifest.
   * Safe to call multiple times for independent packs.
   */
  registerPack(pack: RulePackManifest): void {
    if (this.packManifests.has(pack.id)) {
      throw new Error(`[RuleRegistry] Duplicate pack ID "${pack.id}".`);
    }
    this.packManifests.set(pack.id, pack);
    for (const rule of pack.rules) {
      this.register(rule);
    }
  }

  /** Retrieve a rule by ID. Returns undefined if not found. */
  getRule(id: string): RuleDefinition | undefined {
    return this.rules.get(id);
  }

  /** All registered rules (enabled + disabled) */
  getAllRules(): RuleDefinition[] {
    return Array.from(this.rules.values());
  }

  /** Enabled rules only */
  getEnabledRules(): RuleDefinition[] {
    return this.getAllRules().filter((r) => r.enabled);
  }

  /** Enabled rules filtered by category */
  getRulesByCategory(category: RuleCategory): RuleDefinition[] {
    return this.getEnabledRules().filter((r) => r.category === category);
  }

  /** All rule IDs that are marketplace-blocking */
  getMarketplaceBlockingRules(): RuleDefinition[] {
    return this.getEnabledRules().filter((r) => r.marketplaceBlocking);
  }

  /** List all registered pack manifests */
  getPacks(): RulePackManifest[] {
    return Array.from(this.packManifests.values());
  }

  /** Total registered rule count */
  get size(): number {
    return this.rules.size;
  }
}

/**
 * Global singleton registry.
 * Import and call `registry.registerPack(...)` at module initialization.
 */
export const registry = new RuleRegistry();
