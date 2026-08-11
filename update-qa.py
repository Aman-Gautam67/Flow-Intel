import re
import os

path_recipes = 'src/lib/qa/fixtures/flaw-recipes.ts'
os.system('git restore ' + path_recipes)
with open(path_recipes, 'r', encoding='utf8') as f:
    content = f.read()

content = content.replace('type Platform = "n8n" | "make" | "zapier" | "flowise";', 'type Platform = "n8n" | "make" | "zapier" | "flowise" | "node-red" | "activepieces";')

recipes = [
    {
        'id': 'sec001',
        'platforms': '["n8n", "flowise", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec001-node-${i}`, type: "function", name: "Process", wires: [], func: `const apiKey = \'${key}\';\\nreturn msg;` }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "CODE", settings: { sourceCode: { code: `const apiKey = \'${key}\';\\nreturn true;` } } } } };\n'
    },
    {
        'id': 'sec001b',
        'platforms': '["n8n", "zapier", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec001b-node-${i}`, type: "http request", name: "Req", wires: [], headers: { Authorization: `Bearer ${key}` } }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { headers: { Authorization: `Bearer ${key}` } } } } };\n'
    },
    {
        'id': 'sec002',
        'platforms': '["n8n", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec002-node-${i}`, type: "http in", name: "In", wires: [], url: "/public", method: "post" }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", settings: { authentication: "NONE" }, nextAction: null } };\n'
    },
    {
        'id': 'sec003',
        'platforms': '["n8n", "make", "zapier", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec003-node-${i}`, type: "http request", name: "Req", wires: [], url: url, method: "GET" }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { url: url, method: "GET" } } } };\n'
    },
    {
        'id': 'sec004',
        'platforms': '["n8n", "flowise", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec004-node-${i}`, type: "function", name: "Func", wires: [], func: `${snippet}\\nreturn msg;` }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "CODE", settings: { sourceCode: { code: `${snippet}\\nreturn true;` } } } } };\n'
    },
    {
        'id': 'sec008',
        'platforms': '["n8n", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `sec008-node-${i}`, type: "function", name: "Func", wires: [], func: `const userId = msg.payload.userId;\\nconst query = ${sql};\\nreturn msg;` }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "CODE", settings: { sourceCode: { code: `const userId = \\'123\\';\\nconst query = ${sql};\\nreturn true;` } } } } };\n'
    },
    {
        'id': 'rel001',
        'platforms': '["n8n", "make", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `rel001-node-${i}`, type: "http request", name: "Req", url: "https://api.example.com", wires: [[]] }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { url: "https://api.example.com", errorHandlingOptions: { continueOnFailure: false } } } } };\n'
    },
    {
        'id': 'per013',
        'platforms': '["n8n", "make", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `per013-node-${i}`, type: "debug", name: "Dbg", wires: [], console: "true", complete: "true" }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "CODE", settings: { sourceCode: { code: PII_LOG_SNIPPETS[i % PII_LOG_SNIPPETS.length] + "\\nreturn true;" } } } } };\n'
    },
    {
        'id': 'prv001',
        'platforms': '["n8n", "flowise", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `prv001-node-${i}`, type: "function", name: "Func", wires: [], func: `${snippet}\\nreturn msg;` }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "CODE", settings: { sourceCode: { code: `${snippet}\\nreturn true;` } } } } };\n'
    },
    {
        'id': 'prv003',
        'platforms': '["n8n", "zapier", "node-red", "activepieces"]',
        'logic': '      if (platform === "node-red") return [{ id: `prv003-node-${i}`, type: "http request", name: "Req", wires: [], url: "https://analytics.thirdparty.com/ingest", method: "POST", paytoqs: "ignore" }];\n      if (platform === "activepieces") return { trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { url: "https://analytics.thirdparty.com/ingest", method: "POST", body: "{{trigger.payload}}" } } } };\n'
    },
    {
        'id': 'mnt001',
        'platforms': '["n8n", "node-red"]',
        'logic': '      if (platform === "node-red") return [{ id: `mnt001-node-${i}`, type: "change", name: "Chg", rules: [{t:"set", p:"payload", to:"true"}], wires: [[]] }];\n'
    }
]

for recipe in recipes:
    pattern = r'(ruleId:\s*"' + recipe['id'] + r'".*?platforms:\s*)\[.*?\]'
    content = re.sub(pattern, r'\1' + recipe['platforms'], content, flags=re.DOTALL)
    
    pattern = r'(ruleId:\s*"' + recipe['id'] + r'".*?buildFlawNode\(_?platform,\s*i\)\s*\{)'
    content = re.sub(pattern, r'\1\n' + recipe['logic'], content, flags=re.DOTALL)

for recipe in recipes:
    pattern = r'(ruleId:\s*"' + recipe['id'] + r'".*?buildFlawNode\()_platform'
    content = re.sub(pattern, r'\1platform', content, flags=re.DOTALL)

with open(path_recipes, 'w', encoding='utf8') as f:
    f.write(content)

path_neg = 'src/lib/qa/fixtures/negative-fixtures.ts'
os.system('git restore ' + path_neg + ' >nul 2>&1 || exit 0')
with open(path_neg, 'r', encoding='utf8') as f:
    content_neg = f.read()

content_neg = re.sub(r'type Platform = "n8n"[^;]+;', 'type Platform = "n8n" | "make" | "zapier" | "flowise" | "airflow" | "prefect" | "generic" | "node-red" | "activepieces";', content_neg)
content_neg = re.sub(r',\s*\{\s*id:\s*"node-red-clean-1"[\s\S]*\}\s*\];', '\n];', content_neg)

new_neg = """
  {
    id: "node-red-clean-1",
    platform: "node-red",
    label: "Clean Node-RED flow with safe HTTP",
    cleanReason: "Uses HTTPS, no raw payload, no eval",
    workflow: [
      { id: "nr-1", name: "trig", type: "inject", wires: [["nr-2"]] },
      { id: "nr-2", name: "act", type: "http request", url: "https://api.example.com", method: "GET", wires: [[]] }
    ]
  },
  {
    id: "node-red-clean-2",
    platform: "node-red",
    label: "Clean Node-RED flow with proper auth",
    cleanReason: "Auth headers are used properly",
    workflow: [
      { id: "nr-3", name: "act", type: "http request", headers: { Authorization: "Basic credentials" }, wires: [[]] }
    ]
  },
  {
    id: "activepieces-clean-1",
    platform: "activepieces",
    label: "Clean Activepieces",
    cleanReason: "No PII, safe execution",
    workflow: {
      trigger: { name: "trig", type: "SCHEDULE", nextAction: { name: "act", type: "SLACK" } }
    }
  },
  {
    id: "activepieces-clean-2",
    platform: "activepieces",
    label: "Clean Activepieces 2",
    cleanReason: "Safe HTTP request",
    workflow: {
      trigger: { name: "trig", type: "WEBHOOK", nextAction: { name: "act", type: "HTTP", settings: { url: "https://api.example.com", method: "GET" } } }
    }
  }
];"""

content_neg = content_neg.replace('\n];', ',\n' + new_neg)

with open(path_neg, 'w', encoding='utf8') as f:
    f.write(content_neg)
