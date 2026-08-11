const fs = require('fs');

const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/fixtures/negative-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

// I will just replace the `n8n-prv-keywords-clean` to use code instead of jsCode
content = content.replace(
  'parameters: { jsCode: "const package = \'usage\'; const average = 5; return items;" }',
  'parameters: { code: "const package = \'usage\'; const average = 5; return items;" }'
);

// I will just replace zapier-multi-step to use steps
content = content.replace(
  /id: "zapier-multi-step"[\s\S]*?connections: \{[\s\S]*?\}\n    \}/,
  `id: "zapier-multi-step",
    platform: "zapier",
    label: "Zapier multi-step clean",
    cleanReason: "No PII, normal steps",
    workflow: {
      title: "Zapier Flow",
      status: "on",
      steps: [
        { id: "node-4", type_of: "read", app_name: "schedule", params: {}, selected_api: "ScheduleAPI" },
        { id: "node-5", type_of: "write", app_name: "slack", params: {}, selected_api: "SlackAPI" }
      ]
    }`
);

// For flowise, I will replace flowise-rag-safe with correct format
content = content.replace(
  /id: "flowise-rag-safe"[\s\S]*?edges: \[[\s\S]*?\]\n    \}/,
  `id: "flowise-rag-safe",
    platform: "flowise",
    label: "Flowise RAG proper settings",
    cleanReason: "Standard RAG components",
    workflow: {
      name: "RAG",
      nodes: [
        { id: "node-trigger", position: {x:0, y:0}, type: "customNode", data: { id: "node-trigger", name: "webhook", label: "Webhook", type: "Source" } },
        { id: "node-6", position: {x:200, y:0}, type: "customNode", data: { id: "node-6", name: "llmChain", label: "LLM", type: "Chain" } }
      ],
      edges: [
        { id: "e1", source: "node-trigger", target: "node-6" }
      ]
    }`
);

fs.writeFileSync(path, content, 'utf8');
console.log("Updated fixes!");
