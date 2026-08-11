const fs = require('fs');
let data = fs.readFileSync('src/lib/qa/fixtures/negative-fixtures.ts', 'utf8');

// Update Platform type
data = data.replace(/type Platform = "n8n"[^;]+;/, 'type Platform = "n8n" | "make" | "zapier" | "flowise" | "airflow" | "prefect" | "generic" | "node-red" | "activepieces";');

// Find the last `];` and replace it
const endMatch = data.lastIndexOf('];');
if (endMatch !== -1) {
  const newNeg = `,
  {
    id: 'node-red-clean-1',
    platform: 'node-red',
    label: 'Clean Node-RED flow with safe HTTP',
    cleanReason: 'Uses HTTPS, no raw payload, no eval',
    workflow: [
      { id: 'nr-1', name: 'trig', type: 'inject', wires: [['nr-2']] },
      { id: 'nr-2', name: 'act', type: 'http request', url: 'https://api.example.com', method: 'GET', wires: [[]] }
    ]
  },
  {
    id: 'node-red-clean-2',
    platform: 'node-red',
    label: 'Clean Node-RED flow with proper auth',
    cleanReason: 'Auth headers are used properly',
    workflow: [
      { id: 'nr-3', name: 'act', type: 'http request', headers: { Authorization: 'Basic credentials' }, wires: [[]] }
    ]
  },
  {
    id: 'activepieces-clean-1',
    platform: 'activepieces',
    label: 'Clean Activepieces',
    cleanReason: 'No PII, safe execution',
    workflow: {
      trigger: { name: 'trig', type: 'SCHEDULE', nextAction: { name: 'act', type: 'SLACK' } }
    }
  },
  {
    id: 'activepieces-clean-2',
    platform: 'activepieces',
    label: 'Clean Activepieces 2',
    cleanReason: 'Safe HTTP request',
    workflow: {
      trigger: { name: 'trig', type: 'WEBHOOK', nextAction: { name: 'act', type: 'HTTP', settings: { url: 'https://api.example.com', method: 'GET' } } }
    }
  }
];`;
  data = data.slice(0, endMatch) + newNeg + data.slice(endMatch + 2);
}

fs.writeFileSync('src/lib/qa/fixtures/negative-fixtures.ts', data);
console.log('Done');
