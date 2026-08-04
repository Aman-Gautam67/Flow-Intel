#!/usr/bin/env tsx
/**
 * FlowIntel QA — Phase 1: Fixture Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates 100+ flawed workflow JSON files for four platforms.
 * Output: qa-fixtures/[platform]-[ruleId]-[index]-fail.json
 *
 * Usage:
 *   npx tsx src/lib/qa/generate-fixtures.ts [--out <dir>]
 */

import fs from "fs";
import path from "path";
import { FLAW_RECIPES, type Platform } from "./fixtures/flaw-recipes";
import { buildSkeleton } from "./fixtures/platform-skeletons";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : path.join(process.cwd(), "qa-fixtures");

// ─── Trigger node by platform ─────────────────────────────────────────────────
function makeTriggerNode(platform: Platform, idx: number): unknown {
  switch (platform) {
    case "n8n":
      return {
        id: `trigger-${idx}`,
        name: "Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [200, 300],
        parameters: {},
      };
    case "make":
      return {
        id: `trigger-${idx}`,
        type: "gateway:CustomWebHook",
        parameters: { port: 443, method: "POST" },
      };
    case "zapier":
      return {
        id: `trigger-${idx}`,
        type: "TriggerStep",
        app: "webhook",
        params: { url: "https://hooks.zapier.com/hooks/catch/test" },
      };
    case "flowise":
      return {
        id: `trigger-${idx}`,
        name: "Chat Input",
        type: "chatInput",
        data: { label: "Chat Input" },
      };
  }
}

// ─── Generate ─────────────────────────────────────────────────────────────────
function generate(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  const manifest: Array<{ file: string; platform: Platform; ruleId: string; category: string; flawLabel: string }> = [];

  // Generate 2–4 variants per recipe × platform
  for (const recipe of FLAW_RECIPES) {
    for (const platform of recipe.platforms) {
      const variants = platform === "n8n" ? 4 : 2;

      for (let v = 0; v < variants; v++) {
        const trigger = makeTriggerNode(platform, v);
        const flawNode = recipe.buildFlawNode(platform, v);

        // Some recipes build multi-node workflows (N+1 loop needs HTTP child)
        const extraNodes: unknown[] = [];
        const fn = flawNode as Record<string, unknown>;

        if (fn._hasHttpChildInLoop) {
          extraNodes.push({
            id: `${fn.id}-http-child`,
            name: `Fetch Record ${v}`,
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [700 + v * 20, 300],
            parameters: { url: "https://api.example.com/record/{{$json.id}}", method: "GET" },
          });
        }

        if (fn._noErrorTriggerWorkflow) {
          // No error trigger is the flaw — intentionally no errorTrigger node added
        }

        const nodes = [trigger, flawNode, ...extraNodes];
        const workflowName = `[QA] ${recipe.label} (v${v + 1})`;
        const skeleton = buildSkeleton(platform, workflowName, nodes);

        const filename = `${platform}-${recipe.ruleId}-${v + 1}-fail.json`;
        const filepath = path.join(OUT_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(skeleton, null, 2));

        manifest.push({ file: filename, platform, ruleId: recipe.ruleId, category: recipe.category, flawLabel: recipe.label });
        total++;

        if (process.env.DEBUG) {
          console.log(`  ✍  ${filename}`);
        }
      }
    }
  }

  // Write manifest for Phase 2 / Phase 3 consumption
  const manifestPath = path.join(OUT_DIR, "_manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Phase 1 complete — ${total} fixture files written to: ${OUT_DIR}`);
  console.log(`   Manifest: ${manifestPath}`);
}

generate();
