// Debug: check connection parsing for F2
const F2_CONNECTIONS: Record<string, unknown> = {
  "Manual Trigger": { main: [[{ node: "AI Agent", type: "main", index: 0 }]] },
  "OpenAI LLM": { ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]] },
  "AI Agent": { main: [[{ node: "LLM Chain", type: "main", index: 0 }]] },
  "SQL Tool": { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]] },
  "SSH Execute": { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 1 }]] },
  "LLM Chain": { main: [[{ node: "Send Results HTTP", type: "main", index: 0 }]] },
};

// Problem: SQL Tool's ai_tool connection goes INCOMING to AI Agent,
// not OUTGOING from AI Agent. The agent is the TARGET, not the source.
// Our downstream map walks FROM a node TO its targets.
// So SQL Tool → AI Agent means the agent has INCOMING ai_tool edges,
// but our code looks at agent's OUTGOING edges to find tools.
//
// n8n's tool architecture: tools connect TO the agent (incoming),
// not FROM the agent (outgoing).
// The correct detection: find all nodes that connect TO the agent via ai_tool.

console.log("Connection keys for each source:");
for (const [src, outputs] of Object.entries(F2_CONNECTIONS)) {
  const keys = Object.keys(outputs as object);
  console.log(`  ${src}: [${keys.join(", ")}]`);
  for (const [connType, arr] of Object.entries(outputs as Record<string, unknown>)) {
    if (Array.isArray(arr)) {
      for (const group of arr as unknown[][]) {
        if (Array.isArray(group)) {
          for (const t of group as Array<{ node: string }>) {
            console.log(`    → ${t.node} (via ${connType})`);
          }
        }
      }
    }
  }
}

console.log("\nConclusion: Tools connect TO the agent (ai_tool INCOMING).");
console.log("Fix: Build an INCOMING edge map and look for ai_tool edges pointing at the agent.");
