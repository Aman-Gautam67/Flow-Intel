const fs = require('fs');

const pathRecipes = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/fixtures/flaw-recipes.ts';
require('child_process').execSync('git restore ' + pathRecipes);
let content = fs.readFileSync(pathRecipes, 'utf8');

content = content.replace('type Platform = "n8n" | "make" | "zapier" | "flowise";', 'type Platform = "n8n" | "make" | "zapier" | "flowise" | "node-red" | "activepieces";');

const recipes = [
  {
    id: 'sec001',
    platforms: ['n8n', 'flowise', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec001-node-${i}`, type: "function", name: "Process", func: `const apiKey = \'${key}\';\\nreturn msg;` };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "CODE", settings: { sourceCode: { code: `const apiKey = \'${key}\';\\nreturn true;` } } } } };'
  },
  {
    id: 'sec001b',
    platforms: ['n8n', 'zapier', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec001b-node-${i}`, type: "http request", name: "Req", headers: { Authorization: `Bearer ${key}` } };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "HTTP", settings: { headers: { Authorization: `Bearer ${key}` } } } } };'
  },
  {
    id: 'sec002',
    platforms: ['n8n', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec002-node-${i}`, type: "http in", url: "/public", method: "post" };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", settings: { authentication: "NONE" }, nextAction: null } };'
  },
  {
    id: 'sec003',
    platforms: ['n8n', 'make', 'zapier', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec003-node-${i}`, type: "http request", url: url, method: "GET" };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "HTTP", settings: { url: url, method: "GET" } } } };'
  },
  {
    id: 'sec004',
    platforms: ['n8n', 'flowise', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec004-node-${i}`, type: "function", func: `${snippet}\\nreturn msg;` };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "CODE", settings: { sourceCode: { code: `${snippet}\\nreturn true;` } } } } };'
  },
  {
    id: 'sec008',
    platforms: ['n8n', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `sec008-node-${i}`, type: "function", func: `const userId = msg.payload.userId;\\nconst query = ${sql};\\nreturn msg;` };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "CODE", settings: { sourceCode: { code: `const userId = \'123\';\\nconst query = ${sql};\\nreturn true;` } } } } };'
  },
  {
    id: 'rel001',
    platforms: ['n8n', 'make', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `rel001-node-${i}`, type: "http request", url: "https://api.example.com", wires: [[]] };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "HTTP", settings: { url: "https://api.example.com", errorHandlingOptions: { continueOnFailure: false } } } } };'
  },
  {
    id: 'per013',
    platforms: ['n8n', 'make', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `per013-node-${i}`, type: "debug", console: "true", complete: "true" };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "CODE", settings: { sourceCode: { code: PII_LOG_SNIPPETS[i % PII_LOG_SNIPPETS.length] + "\\nreturn true;" } } } } };'
  },
  {
    id: 'prv001',
    platforms: ['n8n', 'flowise', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `prv001-node-${i}`, type: "function", func: `${snippet}\\nreturn msg;` };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "CODE", settings: { sourceCode: { code: `${snippet}\\nreturn true;` } } } } };'
  },
  {
    id: 'prv003',
    platforms: ['n8n', 'zapier', 'node-red', 'activepieces'],
    logic: '      if (platform === "node-red") return { id: `prv003-node-${i}`, type: "http request", url: "https://analytics.thirdparty.com/ingest", method: "POST", paytoqs: "ignore" };\n      if (platform === "activepieces") return { trigger: { type: "WEBHOOK", nextAction: { type: "HTTP", settings: { url: "https://analytics.thirdparty.com/ingest", method: "POST", body: "{{trigger.payload}}" } } } };'
  },
  {
    id: 'mnt001',
    platforms: ['n8n', 'node-red'],
    logic: '      if (platform === "node-red") return { id: `mnt001-node-${i}`, type: "change", rules: [{t:"set", p:"payload", to:"true"}], wires: [[]] };'
  }
];

let lines = content.split('\\n');
let newLines = [];
let i = 0;
while (i < lines.length) {
  let line = lines[i];
  
  let match = line.match(/ruleId:\s*"([^"]+)"/);
  if (match) {
    let ruleId = match[1];
    let recipe = recipes.find(r => r.id === ruleId);
    if (recipe) {
      newLines.push(line);
      while (i < lines.length - 1 && !lines[i + 1].includes('platforms:')) {
        i++;
        newLines.push(lines[i]);
      }
      i++;
      let platformStr = JSON.stringify(recipe.platforms).replace(/"/g, '"').replace(/,/g, ', ');
      newLines.push(lines[i].replace(/platforms:\s*\[[^\]]+\]/, 'platforms: ' + platformStr));
      
      while (i < lines.length - 1 && !lines[i + 1].includes('buildFlawNode')) {
        i++;
        newLines.push(lines[i]);
      }
      i++;
      newLines.push(lines[i].replace('_platform', 'platform'));
      
      newLines.push(recipe.logic);
      i++;
      continue;
    }
  }
  newLines.push(line);
  i++;
}

fs.writeFileSync(pathRecipes, newLines.join('\\n'), 'utf8');

const pathNeg = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/fixtures/negative-fixtures.ts';
let contentNeg = fs.readFileSync(pathNeg, 'utf8');
contentNeg = contentNeg.replace(/\| "node-red"[^;]*;/, ';'); 
contentNeg = contentNeg.replace(/type Platform = "n8n"[^;]+;/, 'type Platform = "n8n" | "make" | "zapier" | "flowise" | "airflow" | "prefect" | "generic" | "node-red" | "activepieces";');

contentNeg = contentNeg.replace(/,\s*\{\s*id:\s*"node-red-clean-1"[\s\S]*\}\s*/, '');
const endMatch = contentNeg.lastIndexOf('];');
if (endMatch !== -1) {
  const newNeg = `
  {
    id: "node-red-clean-1",
    platform: "node-red",
    label: "Clean Node-RED flow with safe HTTP",
    cleanReason: "Uses HTTPS, no raw payload, no eval",
    workflow: [
      { id: "nr-1", type: "inject", wires: [["nr-2"]] },
      { id: "nr-2", type: "http request", url: "https://api.example.com", method: "GET", wires: [[]] }
    ]
  },
  {
    id: "node-red-clean-2",
    platform: "node-red",
    label: "Clean Node-RED flow with proper auth",
    cleanReason: "Auth headers are used properly",
    workflow: [
      { id: "nr-3", type: "http request", headers: { Authorization: "Basic credentials" }, wires: [[]] }
    ]
  },
  {
    id: "activepieces-clean-1",
    platform: "activepieces",
    label: "Clean Activepieces",
    cleanReason: "No PII, safe execution",
    workflow: {
      trigger: { type: "SCHEDULE", nextAction: { type: "SLACK" } }
    }
  },
  {
    id: "activepieces-clean-2",
    platform: "activepieces",
    label: "Clean Activepieces 2",
    cleanReason: "Safe HTTP request",
    workflow: {
      trigger: { type: "WEBHOOK", nextAction: { type: "HTTP", settings: { url: "https://api.example.com", method: "GET" } } }
    }
  },
`;
  contentNeg = contentNeg.slice(0, endMatch) + newNeg + contentNeg.slice(endMatch);
  fs.writeFileSync(pathNeg, contentNeg, 'utf8');
}
