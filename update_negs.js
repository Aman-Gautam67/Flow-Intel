const fs = require('fs');

const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/fixtures/negative-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix make-webhook-forward-clean
content = content.replace(
  'parameters: { method: "POST", port: 443 },',
  'parameters: { auth: "basic", method: "POST", port: 443 },'
);

// Fix ARCH-CF-001 in all the generic, airflow, and prefect fixtures
// By adding a trigger and edges.
// I will just use regex to replace the nodes array in those fixtures to have a trigger and one other node linked.

function fixWorkflow(id, platform, type) {
  const triggerType = platform === 'airflow' ? 'airflow.trigger' : (platform === 'prefect' ? 'prefect.trigger' : 'generic.trigger');
  return `  {
    id: "${id}",
    platform: "${platform}",
    label: "${platform} clean",
    cleanReason: "Safe",
    workflow: {
      name: "${platform} Flow",
      nodes: [
        { id: "node-trigger", name: "Trigger", type: "${triggerType}", position: [0, 300], parameters: {}, isTrigger: true },
        { id: "node-action", name: "Action", type: "${type}", position: [200, 300], parameters: {} }
      ],
      connections: {
        "Trigger": { main: [[{ node: "Action", type: "main", index: 0 }]] }
      }
    }
  },`;
}

// Actually it's easier to just strip out my added fixtures from last time and append them fresh!
const indexOfNewNegs = content.indexOf('  {\n    id: "n8n-prv-keywords-clean",');
if (indexOfNewNegs !== -1) {
  content = content.substring(0, indexOfNewNegs);
}

// Ensure there is a closing bracket at the end
if (!content.trim().endsWith('];')) {
  content = content.trim() + '\n];\n';
}

const new_negs = `
  {
    id: "n8n-prv-keywords-clean",
    platform: "n8n",
    label: "Safe n8n workflow with keywords like Images, Storage, average, package, usage",
    cleanReason: "Legitimate node names and parameters, no PII.",
    workflow: {
      name: "Image Storage Package",
      nodes: [
        { id: "node-trigger", name: "Trigger", type: "n8n-nodes-base.manualTrigger", position: [0, 300], parameters: {}, isTrigger: true },
        {
          id: "node-1", name: "Images Storage",
          type: "n8n-nodes-base.code", typeVersion: 2,
          position: [200, 300],
          parameters: { jsCode: "const package = 'usage'; const average = 5; return items;" }
        }
      ],
      connections: {
        "Trigger": { main: [[{ node: "Images Storage", type: "main", index: 0 }]] }
      }
    }
  },
  {
    id: "n8n-http-safe-auth",
    platform: "n8n",
    label: "HTTP node with proper auth and error handling",
    cleanReason: "Has authentication and continueOnFail",
    workflow: {
      name: "Safe HTTP",
      nodes: [
        { id: "node-trigger", name: "Trigger", type: "n8n-nodes-base.manualTrigger", position: [0, 300], parameters: {}, isTrigger: true },
        {
          id: "node-2", name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest", typeVersion: 4,
          position: [200, 300],
          parameters: { url: "https://api.example.com", authentication: "predefinedCredentialType" },
          credentials: { httpHeaderAuth: { id: "cred-1", name: "My Auth" } },
          onError: "continueErrorOutput"
        }
      ],
      connections: {
        "Trigger": { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] }
      }
    }
  },
  {
    id: "make-safe-params",
    platform: "make",
    label: "Make workflow with legitimate parameters",
    cleanReason: "Safe params",
    workflow: {
      name: "Make Flow",
      flow: [
        { id: 1, module: "gateway:CustomWebHook", version: 1, parameters: { auth: "basic", method: "POST", port: 443 }, metadata: { designer: { x: 0, y: 0 } } },
        { id: 2, module: "make.http:ActionSendData", position: [200, 300], parameters: { url: "https://api.example.com" }, credentials: { id: "cred-1" } }
      ]
    }
  },
  {
    id: "zapier-multi-step",
    platform: "zapier",
    label: "Zapier multi-step clean",
    cleanReason: "No PII, normal steps",
    workflow: {
      name: "Zapier Flow",
      nodes: [
        { id: "node-4", name: "Zap Trigger", type: "zapier.scheduleapi.read", position: [200, 300], parameters: {}, isTrigger: true },
        { id: "node-5", name: "Zap Action", type: "zapier.slackapi.write", position: [400, 300], parameters: {} }
      ],
      connections: {
        "Zap Trigger": { main: [[{ node: "Zap Action", type: "main", index: 0 }]] }
      }
    }
  },
  {
    id: "flowise-rag-safe",
    platform: "flowise",
    label: "Flowise RAG proper settings",
    cleanReason: "Standard RAG components",
    workflow: {
      name: "RAG",
      nodes: [
        { id: "node-trigger", name: "Trigger", type: "flowise.webhook", position: [0, 300], parameters: { auth: "basic" }, isTrigger: true },
        { id: "node-6", name: "LLM", type: "flowise.llmChain", position: [200, 300], parameters: {} }
      ],
      edges: [
        { id: "e1", source: "node-trigger", target: "node-6" }
      ]
    }
  },
`;

let generic_nodes = "";
for (let i = 7; i < 17; i++) {
  generic_nodes += `
  {
    id: "generic-scale-${i}",
    platform: "n8n",
    label: "Generic node ${i}",
    cleanReason: "Just testing scale ${i}",
    workflow: {
      name: "Scale ${i}",
      nodes: [
        { id: "node-trigger", name: "Trigger", type: "n8n-nodes-base.manualTrigger", position: [0, 300], parameters: {}, isTrigger: true },
`;
  let conns = `"Trigger": { main: [[{ node: "Node 0", type: "main", index: 0 }]] }`;
  for (let j = 0; j < 15; j++) {
    generic_nodes += `
        {
          id: "node-${i}-${j}", name: "Node ${j}",
          type: "n8n-nodes-base.set",
          position: [${(j+1)*100}, 300],
          parameters: {}
        },
`;
    if (j < 14) {
      conns += `, "Node ${j}": { main: [[{ node: "Node ${j+1}", type: "main", index: 0 }]] }`;
    }
  }
  generic_nodes += `
      ],
      connections: {
        ${conns}
      }
    }
  },
`;
}

const rest_negs = `
  {
    id: "airflow-dag-clean",
    platform: "airflow",
    label: "Airflow DAG",
    cleanReason: "Safe DAG",
    workflow: {
      name: "Airflow DAG",
      nodes: [ 
        { id: "task-0", name: "Trigger", type: "airflow.trigger", parameters: {}, isTrigger: true },
        { id: "task-1", name: "Action", type: "airflow.bash", parameters: { command: "echo hello" } }
      ],
      connections: {
        "Trigger": { main: [[{ node: "Action", type: "main", index: 0 }]] }
      }
    }
  },
  {
    id: "prefect-flow-clean",
    platform: "prefect",
    label: "Prefect Flow",
    cleanReason: "Safe Flow",
    workflow: {
      name: "Prefect Flow",
      nodes: [ 
        { id: "task-0", name: "Trigger", type: "prefect.trigger", parameters: {}, isTrigger: true },
        { id: "task-1", name: "Action", type: "prefect.task", parameters: { fn: "my_task" } } 
      ],
      connections: {
        "Trigger": { main: [[{ node: "Action", type: "main", index: 0 }]] }
      }
    }
  }
`;

const index = content.lastIndexOf('];');
if (index !== -1) {
    content = content.slice(0, index) + new_negs + generic_nodes + rest_negs + content.slice(index);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully updated negative fixtures!");
} else {
    console.log("Could not find '];' in negative-fixtures.ts");
}
