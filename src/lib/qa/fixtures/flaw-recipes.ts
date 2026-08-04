/**
 * FlowIntel QA — Flaw Recipes
 * ─────────────────────────────────────────────────────────────────────────────
 * Declarative table of every flaw that can be injected into a test fixture.
 * Each recipe has a canonical rule ID, flaw category, and injection payload
 * for each supported platform format.
 */

export type Platform = "n8n" | "make" | "zapier" | "flowise";
export type FlawCategory =
  | "SECURITY"
  | "RELIABILITY"
  | "PERFORMANCE"
  | "PRIVACY"
  | "ARCHITECTURE";

export interface FlawRecipe {
  ruleId: string;          // e.g. "sec001"
  category: FlawCategory;
  label: string;           // human description
  platforms: Platform[];   // which platforms this recipe applies to
  /** Returns the node/module fragment that carries the flaw */
  buildFlawNode(platform: Platform, index: number): unknown;
  /** Human description of what auto-fix must do */
  fixDescription: string;
}

// ─── Shared constants ────────────────────────────────────────────────────────

const HARDCODED_KEYS = [
  "sk_live_ABCDEF123456",
  "sk_test_XYZ987654321",
  "AKIAIOSFODNN7EXAMPLE",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.FAKE_JWT_SIG",
  "Bearer ghp_FakeGitHubToken0123456789abcdef",
];

const SQL_PAYLOADS = [
  `"SELECT * FROM users WHERE id='" + userId + "'"`,
  "`SELECT * FROM orders WHERE email='${email}'`",
  `"DELETE FROM sessions WHERE token='" + req.body.token + "'"`,
];

const EVAL_SNIPPETS = [
  "eval(items[0].json.code)",
  "const fn = new Function(data); fn();",
  "require('child_process').execSync(cmd)",
];

const HTTP_ENDPOINTS = [
  "http://api.example.com/data",
  "http://internal-service/process",
  "http://payments.company.com/charge",
];

const PII_LOG_SNIPPETS = [
  "console.log('User email:', items[0].json.email)",
  "console.log('SSN:', items[0].json.ssn, 'DOB:', items[0].json.dob)",
  "console.log('Password:', items[0].json.password)",
];

// ─── Recipe table ────────────────────────────────────────────────────────────

export const FLAW_RECIPES: FlawRecipe[] = [
  // ── SECURITY ──────────────────────────────────────────────────────────────

  {
    ruleId: "sec001",
    category: "SECURITY",
    label: "Hardcoded API key in Code node",
    platforms: ["n8n", "flowise"],
    fixDescription: "Replace literal key with {{ $env.API_KEY }}",
    buildFlawNode(platform, i) {
      const key = HARDCODED_KEYS[i % HARDCODED_KEYS.length];
      if (platform === "n8n") {
        return {
          id: `sec001-node-${i}`,
          name: `Process Data ${i}`,
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [500 + i * 20, 300],
          parameters: {
            jsCode: `const apiKey = '${key}';\nconst result = items.map(i => ({...i.json, key: apiKey}));\nreturn result.map(r => ({json: r}));`,
          },
        };
      }
      return {
        id: `sec001-node-${i}`,
        name: `Code ${i}`,
        type: "code",
        data: { code: `const apiKey = '${key}';\nreturn items;` },
      };
    },
  },

  {
    ruleId: "sec001b",
    category: "SECURITY",
    label: "Hardcoded Bearer token in HTTP header",
    platforms: ["n8n", "zapier"],
    fixDescription: "Move Bearer token to credential store",
    buildFlawNode(platform, i) {
      const key = HARDCODED_KEYS[i % HARDCODED_KEYS.length];
      if (platform === "n8n") {
        return {
          id: `sec001b-node-${i}`,
          name: `HTTP Request ${i}`,
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [600 + i * 20, 300],
          parameters: {
            url: "https://api.example.com/data",
            method: "POST",
            sendHeaders: true,
            headerParameters: {
              parameters: [{ name: "Authorization", value: `Bearer ${key}` }],
            },
          },
        };
      }
      // zapier step format
      return {
        id: `sec001b-step-${i}`,
        type: "ActionStep",
        app: "code",
        params: {
          code: `const headers = { Authorization: 'Bearer ${key}' };\nreturn {headers};`,
        },
      };
    },
  },

  {
    ruleId: "sec002",
    category: "SECURITY",
    label: "Unauthenticated webhook trigger",
    platforms: ["n8n"],
    fixDescription: "Set authentication to headerAuth or basicAuth",
    buildFlawNode(_platform, i) {
      return {
        id: `sec002-node-${i}`,
        name: `Webhook ${i}`,
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [200, 300 + i * 60],
        parameters: {
          path: `public-endpoint-${i}`,
          httpMethod: "POST",
          responseMode: "lastNode",
          authentication: "none",
        },
      };
    },
  },

  {
    ruleId: "sec003",
    category: "SECURITY",
    label: "HTTP (not HTTPS) egress to external host",
    platforms: ["n8n", "make", "zapier"],
    fixDescription: "Replace http:// with https://",
    buildFlawNode(platform, i) {
      const url = HTTP_ENDPOINTS[i % HTTP_ENDPOINTS.length];
      if (platform === "n8n") {
        return {
          id: `sec003-node-${i}`,
          name: `Call API ${i}`,
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [700 + i * 20, 300],
          parameters: { url, method: "GET" },
        };
      }
      if (platform === "make") {
        return {
          id: `sec003-mod-${i}`,
          type: "http:ActionSendData",
          parameters: { url, method: "GET" },
        };
      }
      return {
        id: `sec003-step-${i}`,
        type: "ActionStep",
        app: "webhooks",
        params: { url, method: "GET" },
      };
    },
  },

  {
    ruleId: "sec004",
    category: "SECURITY",
    label: "eval() / child_process in Code node",
    platforms: ["n8n", "flowise"],
    fixDescription: "Remove eval/exec; use safe AST-based code paths",
    buildFlawNode(platform, i) {
      const snippet = EVAL_SNIPPETS[i % EVAL_SNIPPETS.length];
      if (platform === "n8n") {
        return {
          id: `sec004-node-${i}`,
          name: `Dynamic Exec ${i}`,
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [500 + i * 20, 400],
          parameters: { jsCode: `${snippet}\nreturn items;` },
        };
      }
      return {
        id: `sec004-node-${i}`,
        name: `Exec ${i}`,
        type: "code",
        data: { code: `${snippet}\nreturn items;` },
      };
    },
  },

  {
    ruleId: "sec008",
    category: "SECURITY",
    label: "SQL injection via string concatenation",
    platforms: ["n8n"],
    fixDescription: "Use parameterised queries instead of string concatenation",
    buildFlawNode(_platform, i) {
      const sql = SQL_PAYLOADS[i % SQL_PAYLOADS.length];
      return {
        id: `sec008-node-${i}`,
        name: `Query DB ${i}`,
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [600 + i * 20, 400],
        parameters: {
          jsCode: `const userId = items[0].json.userId;\nconst query = ${sql};\nreturn [{json: {query}}];`,
        },
      };
    },
  },

  // ── RELIABILITY ───────────────────────────────────────────────────────────

  {
    ruleId: "rel001",
    category: "RELIABILITY",
    label: "HTTP node with no error handling branch",
    platforms: ["n8n", "make"],
    fixDescription: "Add continueOnFail or wire error output to Error Handler node",
    buildFlawNode(platform, i) {
      if (platform === "n8n") {
        return {
          id: `rel001-node-${i}`,
          name: `Fetch Data ${i}`,
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [700 + i * 20, 300],
          parameters: { url: "https://api.example.com/records", method: "GET" },
          // Note: no onError/continueOnFail
        };
      }
      return {
        id: `rel001-mod-${i}`,
        type: "http:ActionSendData",
        parameters: { url: "https://api.example.com/records", method: "GET" },
        // no errorHandler
      };
    },
  },

  {
    ruleId: "rel002",
    category: "RELIABILITY",
    label: "Unbounded SplitInBatches loop (no maxItems)",
    platforms: ["n8n"],
    fixDescription: "Set batchSize and add a maxItems guard expression",
    buildFlawNode(_platform, i) {
      return {
        id: `rel002-node-${i}`,
        name: `Loop Items ${i}`,
        type: "n8n-nodes-base.splitInBatches",
        typeVersion: 3,
        position: [550 + i * 20, 300],
        parameters: {
          batchSize: 0,  // 0 = unbounded
          options: {},
        },
      };
    },
  },

  {
    ruleId: "rel011",
    category: "RELIABILITY",
    label: "Potential infinite loop (self-referencing connection)",
    platforms: ["n8n"],
    fixDescription: "Add iteration counter + IF guard to break cycle",
    buildFlawNode(_platform, i) {
      return {
        id: `rel011-node-${i}`,
        name: `Poll Status ${i}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 30, 350],
        parameters: {
          url: "https://api.example.com/status",
          method: "GET",
        },
        // Connection will loop back to itself (added by generator)
        _selfLoop: true,
      };
    },
  },

  {
    ruleId: "rel004",
    category: "RELIABILITY",
    label: "Missing global Error Trigger",
    platforms: ["n8n"],
    fixDescription: "Add n8n-nodes-base.errorTrigger node wired to a notification step",
    buildFlawNode(_platform, i) {
      // The flaw IS the absence of an error trigger — represented by a placeholder
      return {
        id: `rel004-node-${i}`,
        name: `Send Email ${i}`,
        type: "n8n-nodes-base.gmail",
        typeVersion: 2,
        position: [800 + i * 20, 300],
        parameters: {
          operation: "send",
          toEmail: "admin@example.com",
          subject: "Alert",
          message: "Something happened",
        },
        _noErrorTriggerWorkflow: true,
      };
    },
  },

  // ── PERFORMANCE ───────────────────────────────────────────────────────────

  {
    ruleId: "per001",
    category: "PERFORMANCE",
    label: "N+1 HTTP call inside a loop",
    platforms: ["n8n"],
    fixDescription: "Move HTTP call outside the loop or use batch endpoint",
    buildFlawNode(_platform, i) {
      return {
        id: `per001-loop-${i}`,
        name: `Batch Loop ${i}`,
        type: "n8n-nodes-base.splitInBatches",
        typeVersion: 3,
        position: [500 + i * 20, 300],
        parameters: { batchSize: 1, options: {} },
        _hasHttpChildInLoop: true,
      };
    },
  },

  {
    ruleId: "per013",
    category: "PERFORMANCE",
    label: "Verbose debug logging enabled",
    platforms: ["n8n", "make"],
    fixDescription: "Disable verbose/debug logging in production parameters",
    buildFlawNode(platform, i) {
      if (platform === "n8n") {
        return {
          id: `per013-node-${i}`,
          name: `Process ${i}`,
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [500 + i * 20, 300],
          parameters: {
            jsCode: PII_LOG_SNIPPETS[i % PII_LOG_SNIPPETS.length] + "\nreturn items;",
          },
        };
      }
      return {
        id: `per013-mod-${i}`,
        type: "builtin:BasicFeeder",
        parameters: { verboseLog: true, debugMode: true },
      };
    },
  },

  {
    ruleId: "per026",
    category: "PERFORMANCE",
    label: "O(n²) nested loop in Code node",
    platforms: ["n8n"],
    fixDescription: "Replace nested loop with Map/Set O(n) lookup",
    buildFlawNode(_platform, i) {
      return {
        id: `per026-node-${i}`,
        name: `Deduplicate ${i}`,
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [600 + i * 20, 300],
        parameters: {
          jsCode: [
            "const itemsIn = items;",
            "for(let i=0;i<itemsIn.length;i++){",
            "  for(let j=0;j<itemsIn.length;j++){",
            "    if(itemsIn[i].json.id === itemsIn[j].json.id && i!==j){",
            "      itemsIn[i].json.duplicate=true;",
            "    }",
            "  }",
            "}",
            "return itemsIn;",
          ].join("\n"),
        },
      };
    },
  },

  // ── PRIVACY ───────────────────────────────────────────────────────────────

  {
    ruleId: "prv001",
    category: "PRIVACY",
    label: "PII in console.log inside Code node",
    platforms: ["n8n", "flowise"],
    fixDescription: "Remove PII from logs; use structured redacted logging",
    buildFlawNode(platform, i) {
      const snippet = PII_LOG_SNIPPETS[i % PII_LOG_SNIPPETS.length];
      if (platform === "n8n") {
        return {
          id: `prv001-node-${i}`,
          name: `Log Debug ${i}`,
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [500 + i * 20, 300],
          parameters: {
            jsCode: `${snippet}\nreturn items;`,
          },
        };
      }
      return {
        id: `prv001-node-${i}`,
        name: `Log ${i}`,
        type: "code",
        data: { code: `${snippet}\nreturn items;` },
      };
    },
  },

  {
    ruleId: "prv003",
    category: "PRIVACY",
    label: "Outbound HTTP sends raw PII payload",
    platforms: ["n8n", "zapier"],
    fixDescription: "Strip PII fields before sending; use field allowlist",
    buildFlawNode(platform, i) {
      if (platform === "n8n") {
        return {
          id: `prv003-node-${i}`,
          name: `Send PII ${i}`,
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [700 + i * 20, 300],
          parameters: {
            url: "https://analytics.thirdparty.com/ingest",
            method: "POST",
            sendBody: true,
            specifyBody: "json",
            jsonBody: "={{ $json }}",  // sends everything including PII
          },
        };
      }
      return {
        id: `prv003-step-${i}`,
        type: "ActionStep",
        app: "webhooks",
        params: {
          url: "https://analytics.thirdparty.com/ingest",
          payload: "{{bundle.inputData}}",
        },
      };
    },
  },

  // ── ARCHITECTURE ──────────────────────────────────────────────────────────

  {
    ruleId: "mnt001",
    category: "ARCHITECTURE",
    label: "Dead-end / orphan node (no outgoing connection)",
    platforms: ["n8n"],
    fixDescription: "Connect or remove orphan node",
    buildFlawNode(_platform, i) {
      return {
        id: `mnt001-node-${i}`,
        name: `Dead Node ${i}`,
        type: "n8n-nodes-base.set",
        typeVersion: 3,
        position: [900 + i * 20, 600],
        parameters: { assignments: { assignments: [{ name: "unused", value: "true" }] } },
        _orphan: true,
      };
    },
  },

  {
    ruleId: "cmp001",
    category: "ARCHITECTURE",
    label: "Deprecated node type (n8n-nodes-base.function)",
    platforms: ["n8n"],
    fixDescription: "Replace function node with code node (typeVersion 2)",
    buildFlawNode(_platform, i) {
      return {
        id: `cmp001-node-${i}`,
        name: `Transform ${i}`,
        type: "n8n-nodes-base.function",   // deprecated
        typeVersion: 1,
        position: [500 + i * 20, 300],
        parameters: {
          functionCode: "return items.map(i => ({json: i.json}));",
        },
      };
    },
  },

  {
    ruleId: "cmp003",
    category: "ARCHITECTURE",
    label: "Outdated node typeVersion (httpRequest v1)",
    platforms: ["n8n"],
    fixDescription: "Upgrade to typeVersion 4",
    buildFlawNode(_platform, i) {
      return {
        id: `cmp003-node-${i}`,
        name: `Old HTTP ${i}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 1,   // should be 4
        position: [600 + i * 20, 300],
        parameters: {
          url: "https://api.example.com/data",
          method: "GET",
        },
      };
    },
  },
];
