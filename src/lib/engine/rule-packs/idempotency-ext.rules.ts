/**
 * FlowIntel Idempotency Extension — IDP-004 to IDP-020
 */
import type { Finding, ParsedWorkflow, RulePackManifest } from "../types";

function fid(r: string, n: string) { return `${r}-${n}`; }
function ps(node: { parameters?: unknown }): string { return JSON.stringify(node.parameters ?? {}); }

export const IDEMPOTENCY_EXT: RulePackManifest = {
  id: "flowintel-idempotency-ext",
  name: "FlowIntel Idempotency Extension",
  version: "2.0.0",
  description: "IDP-004 through IDP-020: payment safety, email dedup, charge guards, event replay.",
  rules: [
    {
      id: "IDP-004",
      name: "Payment Charge Without Idempotency Key",
      category: "IDEMPOTENCY",
      severity: "CRITICAL",
      description: "Stripe/PayPal charge node has no idempotency key — retried charges will double-bill.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/IDP-004",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const PAY = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.paypal","n8n-nodes-base.braintree"]);
        for (const node of ast.nodes) {
          if (!PAY.has(node.type)) continue;
          const op = String((node.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["charge","create","capture","payment"].some((v) => op.includes(v))) continue;
          const s = ps(node);
          if (!/idempotency|idempotencyKey|x-idempotency/i.test(s)) {
            findings.push({
              id: fid("IDP-004", node.id), ruleId: "IDP-004",
              ruleName: "Payment Charge Without Idempotency Key",
              severity: "CRITICAL", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Payment charge with no idempotency key", detail: `"${node.name}" creates a charge without an idempotency key — any retry will double-bill the customer.` },
              humanExplanation: "Stripe, PayPal, and other payment processors support idempotency keys to prevent duplicate charges on retry. Without one, any network glitch during checkout causes a double charge.",
              suggestedFix: `Pass idempotencyKey: '{{$execution.id}}' to "${node.name}" to make it safe to retry.`,
              marketplaceBlocking: true, docReference: "https://flowintel.io/rules/IDP-004", penaltyPoints: 35,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-005",
      name: "Email Send Without Deduplication Check",
      category: "IDEMPOTENCY",
      severity: "HIGH",
      description: "Email-sending node in a triggered workflow with no dedup guard — sends duplicates on retry.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 20,
      docReference: "https://flowintel.io/rules/IDP-005",
      detect(ast: ParsedWorkflow): Finding[] {
        const EMAIL = new Set(["n8n-nodes-base.gmail","n8n-nodes-base.sendEmail","n8n-nodes-base.emailSend","n8n-nodes-base.sendgrid","n8n-nodes-base.mailchimp"]);
        const emailNodes = ast.nodes.filter((n) => EMAIL.has(n.type));
        if (emailNodes.length === 0) return [];
        const hasTrigger = ast.nodes.some((n) => n.isTrigger);
        if (!hasTrigger) return [];
        const hasDedup = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.removeDuplicates" ||
          n.type === "n8n-nodes-base.redis" ||
          /dedup|deduplicate|alreadySent|sentLog/i.test(ps(n))
        );
        if (hasDedup) return [];
        return emailNodes.map((node) => ({
          id: fid("IDP-005", node.id), ruleId: "IDP-005",
          ruleName: "Email Send Without Deduplication Check",
          severity: "HIGH" as const, category: "IDEMPOTENCY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Email node with no dedup guard", detail: `"${node.name}" sends emails from a triggered workflow with no deduplication — retried triggers send duplicate emails.` },
          humanExplanation: "Recipients receiving duplicate emails is a serious UX and legal issue. Triggered email workflows must check whether the email was already sent.",
          suggestedFix: "Log sent email IDs to a database or Redis. Before sending, check if the ID was already processed.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-005", penaltyPoints: 20,
        }));
      },
    },

    {
      id: "IDP-006",
      name: "Database INSERT Without Upsert Guard",
      category: "IDEMPOTENCY",
      severity: "HIGH",
      description: "Plain INSERT without ON CONFLICT or upsert logic creates duplicate rows on replay.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/IDP-006",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        for (const node of ast.nodes) {
          if (!DB.has(node.type)) continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const op = String(pp?.operation ?? "").toLowerCase();
          if (op !== "insert" && op !== "create") continue;
          const s = ps(node);
          if (!/upsert|onConflict|ON CONFLICT|insertOrUpdate|createOrUpdate/i.test(s)) {
            findings.push({
              id: fid("IDP-006", node.id), ruleId: "IDP-006",
              ruleName: "Database INSERT Without Upsert Guard",
              severity: "HIGH", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Plain INSERT with no upsert/ON CONFLICT guard", detail: `"${node.name}" performs a plain INSERT. Replaying this workflow creates duplicate rows.` },
              humanExplanation: "Replayed webhooks or retried executions will insert duplicate database records without upsert protection.",
              suggestedFix: `Change "${node.name}" to use upsert/ON CONFLICT DO UPDATE to make inserts safe to replay.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-006", penaltyPoints: 18,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-007",
      name: "Notification Sent in Non-Idempotent Webhook Handler",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Slack/Discord notification sent directly from a webhook handler without event deduplication.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/IDP-007",
      detect(ast: ParsedWorkflow): Finding[] {
        const NOTIF = new Set(["n8n-nodes-base.slack","n8n-nodes-base.discord","n8n-nodes-base.telegram","n8n-nodes-base.mattermost"]);
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const notifNodes = ast.nodes.filter((n) => NOTIF.has(n.type));
        if (notifNodes.length === 0) return [];
        const hasDedup = ast.nodes.some((n) =>
          n.type === "n8n-nodes-base.removeDuplicates" ||
          n.type === "n8n-nodes-base.redis" ||
          /dedup|eventId|messageId|alreadyProcessed/i.test(ps(n))
        );
        if (hasDedup) return [];
        return notifNodes.map((node) => ({
          id: fid("IDP-007", node.id), ruleId: "IDP-007",
          ruleName: "Notification Sent in Non-Idempotent Webhook Handler",
          severity: "MEDIUM" as const, category: "IDEMPOTENCY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Notification in webhook without event dedup", detail: `"${node.name}" sends a notification in a webhook handler with no deduplication — webhook retries send duplicate notifications.` },
          humanExplanation: "Webhook providers retry delivery on timeout. Each retry sends an additional notification, spamming your team.",
          suggestedFix: "Cache the webhook event ID in Redis with a 24h TTL. Skip processing if the ID was already handled.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-007", penaltyPoints: 12,
        }));
      },
    },

    {
      id: "IDP-008",
      name: "Order/Record Creation Not Guarded by Existence Check",
      category: "IDEMPOTENCY",
      severity: "HIGH",
      description: "Workflow creates an order or record without first checking if it already exists.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 18,
      docReference: "https://flowintel.io/rules/IDP-008",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        const CREAT = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.shopify","n8n-nodes-base.woocommerce"]);
        for (const node of ast.nodes) {
          if (!CREAT.has(node.type)) continue;
          const op = String((node.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          if (!["create","createOrder","placeOrder","newOrder"].some((v) => op.includes(v))) continue;
          const upstream = ast.edges.filter((e) => e.target === node.name).map((e) => e.source);
          const hasExistenceCheck = upstream.some((src) => {
            const srcNode = ast.nodes.find((n) => n.name === src);
            if (!srcNode) return false;
            const srcOp = String((srcNode.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
            return srcNode.type === "n8n-nodes-base.if" || ["get","find","search","exists"].some((v) => srcOp.includes(v));
          });
          if (!hasExistenceCheck) {
            findings.push({
              id: fid("IDP-008", node.id), ruleId: "IDP-008",
              ruleName: "Order/Record Creation Not Guarded by Existence Check",
              severity: "HIGH", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Create operation with no prior existence check", detail: `"${node.name}" creates a resource without checking if it already exists — replay creates duplicate orders.` },
              humanExplanation: "Creating duplicate orders means duplicate charges, duplicate fulfilments, and angry customers.",
              suggestedFix: `Before "${node.name}", add a GET to check if the resource exists. Only create if it doesn't.`,
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-008", penaltyPoints: 18,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-009",
      name: "Scheduled Trigger Without Last-Run Tracking",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Scheduled workflow fetches and processes data without tracking what was last processed.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/IDP-009",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasSchedule = ast.nodes.some((n) => n.type === "n8n-nodes-base.scheduleTrigger");
        if (!hasSchedule) return [];
        const hasLastRunTracking = ast.nodes.some((n) => {
          const s = ps(n);
          return /lastRun|lastProcessed|lastId|watermark|checkpoint|since|updatedAfter/i.test(s);
        });
        if (hasLastRunTracking) return [];
        const trigger = ast.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger")!;
        return [{
          id: fid("IDP-009", trigger.id), ruleId: "IDP-009",
          ruleName: "Scheduled Trigger Without Last-Run Tracking",
          severity: "MEDIUM", category: "IDEMPOTENCY",
          location: { nodeId: trigger.id, nodeName: trigger.name, nodeType: trigger.type },
          evidence: { summary: "Schedule with no last-run cursor", detail: "Scheduled workflow fetches data without a cursor/watermark — each run processes the full dataset including already-processed items." },
          humanExplanation: "Without a watermark, a scheduled workflow processes all historical records every run, causing duplicate processing and wasted compute.",
          suggestedFix: "Store the last-processed timestamp or ID to a database after each run and use it as a filter in the next run.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-009", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "IDP-010",
      name: "Idempotency Key Based on Mutable Data",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Idempotency key is derived from mutable fields (e.g. timestamp, name) instead of a stable ID.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-010",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          const s = ps(node);
          if (!/idempotencyKey|idempotency-key|x-idempotency/i.test(s)) continue;
          if (/Date\.now\(\)|new Date\(\)|timestamp|\$now/i.test(s)) {
            findings.push({
              id: fid("IDP-010", node.id), ruleId: "IDP-010",
              ruleName: "Idempotency Key Based on Mutable Data",
              severity: "MEDIUM", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Idempotency key uses timestamp", detail: `"${node.name}" uses a timestamp-based idempotency key — different on each retry, defeating idempotency.` },
              humanExplanation: "A timestamp-based idempotency key generates a new unique key on each retry, providing zero replay protection.",
              suggestedFix: "Use a stable, content-derived key: hash of the payload, or $execution.id + record ID.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-010", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-011",
      name: "Webhook Event Type Not Checked",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Webhook handler does not filter by event type — processes all events including unintended ones.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-011",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasWebhook = ast.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
        if (!hasWebhook) return [];
        const hasEventFilter = ast.nodes.some((n) => {
          const s = ps(n);
          return /eventType|event\.type|x-github-event|stripe-signature|type.*===|filterByEvent/i.test(s);
        });
        if (hasEventFilter) return [];
        const webhook = ast.nodes.find((n) => n.type === "n8n-nodes-base.webhook")!;
        return [{
          id: fid("IDP-011", webhook.id), ruleId: "IDP-011",
          ruleName: "Webhook Event Type Not Checked",
          severity: "MEDIUM", category: "IDEMPOTENCY",
          location: { nodeId: webhook.id, nodeName: webhook.name, nodeType: webhook.type },
          evidence: { summary: "No event-type filter after webhook", detail: "Webhook receives all event types but the workflow processes them all identically — unintended events trigger the same logic." },
          humanExplanation: "Receiving and processing unexpected event types causes incorrect operations. Stripe webhooks, for example, send dozens of event types to the same URL.",
          suggestedFix: "Add an If node after the trigger to check event.type and only proceed for expected event types.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-011", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "IDP-012",
      name: "Multi-Step Workflow Without Execution Lock",
      category: "IDEMPOTENCY",
      severity: "HIGH",
      description: "Long workflow that modifies shared resources has no distributed lock to prevent concurrent execution.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 15,
      docReference: "https://flowintel.io/rules/IDP-012",
      detect(ast: ParsedWorkflow): Finding[] {
        if (ast.nodes.length < 8) return [];
        const WRITE = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb","n8n-nodes-base.redis"]);
        const hasWrite = ast.nodes.some((n) => WRITE.has(n.type));
        if (!hasWrite) return [];
        const hasLock = ast.nodes.some((n) => {
          const s = ps(n);
          return /lock|mutex|semaphore|distributed.*lock|redis.*setnx|nx.*set/i.test(s);
        });
        if (hasLock) return [];
        return [{
          id: "IDP-012-workflow", ruleId: "IDP-012",
          ruleName: "Multi-Step Workflow Without Execution Lock",
          severity: "HIGH", category: "IDEMPOTENCY",
          location: {},
          evidence: { summary: "Shared state writes without distributed lock", detail: "Long workflow writes to shared state without a distributed lock — concurrent executions corrupt data." },
          humanExplanation: "Two concurrent executions of a multi-step workflow can interleave their writes, corrupting shared state.",
          suggestedFix: "Use Redis SETNX or a DB row lock at the start of the workflow to prevent concurrent execution of the critical section.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-012", penaltyPoints: 15,
        }];
      },
    },

    {
      id: "IDP-013",
      name: "File Write Without Atomic Swap",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Code node writes to a file without atomic rename — partial writes leave corrupt files on failure.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-013",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/writeFile/.test(code) && !/rename|atomic|tmp|temp/i.test(code)) {
            findings.push({
              id: fid("IDP-013", node.id), ruleId: "IDP-013",
              ruleName: "File Write Without Atomic Swap",
              severity: "MEDIUM", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "writeFile without atomic rename", detail: `"${node.name}" writes directly to the target file — a crash mid-write leaves a corrupt partial file.` },
              humanExplanation: "Direct file writes are not atomic. A workflow crash mid-write leaves the file in a corrupt, partially-written state.",
              suggestedFix: "Write to a .tmp file first, then rename it to the target path (fs.rename is atomic on POSIX systems).",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-013", penaltyPoints: 10,
            });
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-014",
      name: "Cache Invalidation Without Version Key",
      category: "IDEMPOTENCY",
      severity: "LOW",
      description: "Redis/cache writes use fixed keys — concurrent writers overwrite each other without versioning.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/IDP-014",
      detect(ast: ParsedWorkflow): Finding[] {
        const redisNodes = ast.nodes.filter((n) => n.type === "n8n-nodes-base.redis");
        if (redisNodes.length === 0) return [];
        return redisNodes.filter((node) => {
          const pp = node.parameters as Record<string,unknown> | undefined;
          const op = String(pp?.operation ?? "").toLowerCase();
          if (!["set","hset","mset"].includes(op)) return false;
          const key = String(pp?.key ?? "");
          return !/version|etag|hash|checksum|\$\{/.test(key);
        }).map((node) => ({
          id: fid("IDP-014", node.id), ruleId: "IDP-014",
          ruleName: "Cache Invalidation Without Version Key",
          severity: "LOW" as const, category: "IDEMPOTENCY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Static Redis key without versioning", detail: `"${node.name}" writes to a fixed cache key — concurrent writes may corrupt cached values.` },
          humanExplanation: "Fixed cache keys with concurrent writers cause the cache to hold a mix of old and new values, leading to inconsistent reads.",
          suggestedFix: "Include a version, hash, or execution ID in the cache key to prevent concurrent write collisions.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-014", penaltyPoints: 5,
        }));
      },
    },

    {
      id: "IDP-015",
      name: "Subscription/Recurring Charge Without Guard",
      category: "IDEMPOTENCY",
      severity: "CRITICAL",
      description: "Recurring subscription charge not protected against duplicate execution.",
      enabled: true, marketplaceBlocking: true, penaltyPoints: 35,
      docReference: "https://flowintel.io/rules/IDP-015",
      detect(ast: ParsedWorkflow): Finding[] {
        const PAY = new Set(["n8n-nodes-base.stripe","n8n-nodes-base.paypal"]);
        const chargeNodes = ast.nodes.filter((n) => {
          if (!PAY.has(n.type)) return false;
          const op = String((n.parameters as Record<string,unknown>)?.operation ?? "").toLowerCase();
          return ["subscription","recurring","charge","invoice"].some((v) => op.includes(v));
        });
        if (chargeNodes.length === 0) return [];
        const hasGuard = ast.nodes.some((n) => {
          const s = ps(n);
          return /idempotency|dedup|alreadyCharged|subscriptionId/i.test(s);
        });
        if (hasGuard) return [];
        return chargeNodes.map((node) => ({
          id: fid("IDP-015", node.id), ruleId: "IDP-015",
          ruleName: "Subscription/Recurring Charge Without Guard",
          severity: "CRITICAL" as const, category: "IDEMPOTENCY" as const,
          location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
          evidence: { summary: "Recurring charge with no duplicate guard", detail: `"${node.name}" creates a recurring charge with no idempotency or duplicate-check guard.` },
          humanExplanation: "A workflow error or retry during a recurring charge creates a duplicate subscription and double-bills the customer.",
          suggestedFix: "Check if a subscription already exists for this customer before creating a new one. Use Stripe's idempotency key on the charge API call.",
          marketplaceBlocking: true, docReference: "https://flowintel.io/rules/IDP-015", penaltyPoints: 35,
        }));
      },
    },

    {
      id: "IDP-016",
      name: "State Machine Without Idempotent Transitions",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Workflow implements a state machine but transitions are not idempotent (applying twice changes state).",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 12,
      docReference: "https://flowintel.io/rules/IDP-016",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasStateMachine = ast.nodes.some((n) => {
          const s = ps(n);
          return /status.*UPDATE|state.*transition|workflow.*state|step.*complete/i.test(s);
        });
        if (!hasStateMachine) return [];
        const hasIdempotentTransition = ast.nodes.some((n) => {
          const s = ps(n);
          return /WHERE.*status.*=.*'pending'|currentState.*===|onlyIf.*state/i.test(s);
        });
        if (hasIdempotentTransition) return [];
        return [{
          id: "IDP-016-workflow", ruleId: "IDP-016",
          ruleName: "State Machine Without Idempotent Transitions",
          severity: "MEDIUM", category: "IDEMPOTENCY",
          location: {},
          evidence: { summary: "State transitions not guarded by current state check", detail: "Workflow updates state without checking the current state first — applying the transition twice may corrupt the state machine." },
          humanExplanation: "An idempotent state transition only applies if the record is in the expected source state. Without this check, replaying the workflow applies the same transition multiple times.",
          suggestedFix: "Add WHERE status = 'expected_state' to all UPDATE queries so the transition is only applied once.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-016", penaltyPoints: 12,
        }];
      },
    },

    {
      id: "IDP-017",
      name: "Batch Job Without Processed-ID Tracking",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "Batch processing workflow does not track which record IDs were successfully processed.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 10,
      docReference: "https://flowintel.io/rules/IDP-017",
      detect(ast: ParsedWorkflow): Finding[] {
        const hasLoop = ast.nodes.some((n) => n.type === "n8n-nodes-base.splitInBatches");
        if (!hasLoop) return [];
        const hasIdTracking = ast.nodes.some((n) => {
          const s = ps(n);
          return /processedIds|handledIds|completedIds|markProcessed|processed.*set/i.test(s);
        });
        if (hasIdTracking) return [];
        return [{
          id: "IDP-017-workflow", ruleId: "IDP-017",
          ruleName: "Batch Job Without Processed-ID Tracking",
          severity: "MEDIUM", category: "IDEMPOTENCY",
          location: {},
          evidence: { summary: "Batch loop with no processed-ID log", detail: "Batch workflow processes records but does not log which IDs were successfully handled — restarting re-processes completed records." },
          humanExplanation: "Without tracking processed IDs, a batch restart re-processes already-handled records, causing duplicate operations.",
          suggestedFix: "After each successful record, write its ID to a 'processed' set in Redis or a DB table. Skip IDs already in the set.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-017", penaltyPoints: 10,
        }];
      },
    },

    {
      id: "IDP-018",
      name: "Webhook Secret Rotation Not Handled",
      category: "IDEMPOTENCY",
      severity: "LOW",
      description: "Webhook verification uses a hardcoded secret with no rotation mechanism.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/IDP-018",
      detect(ast: ParsedWorkflow): Finding[] {
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!node.isCode) continue;
          const code = node.codeMeta?.codeSnippet ?? ps(node);
          if (/hmac|sha256/i.test(code)) {
            const hasHardcodedSecret = /(?:secret|key)\s*=\s*['"][A-Za-z0-9+/=]{16,}['"]/i.test(code);
            const hasEnvSecret = /process\.env|\$env/.test(code);
            if (hasHardcodedSecret && !hasEnvSecret) {
              findings.push({
                id: fid("IDP-018", node.id), ruleId: "IDP-018",
                ruleName: "Webhook Secret Rotation Not Handled",
                severity: "LOW", category: "IDEMPOTENCY",
                location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
                evidence: { summary: "Hardcoded HMAC secret", detail: `"${node.name}" uses a hardcoded HMAC secret that cannot be rotated without modifying the workflow.` },
                humanExplanation: "Hardcoded secrets cannot be rotated on breach. If the secret is compromised, the only fix is to modify and redeploy the workflow.",
                suggestedFix: "Move the HMAC secret to an n8n credential or environment variable so it can be rotated without changing code.",
                marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-018", penaltyPoints: 5,
              });
            }
          }
        }
        return findings;
      },
    },

    {
      id: "IDP-019",
      name: "Outbox Pattern Not Used for External Calls",
      category: "IDEMPOTENCY",
      severity: "LOW",
      description: "Workflow writes to DB and calls external API in same execution without transactional outbox.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 5,
      docReference: "https://flowintel.io/rules/IDP-019",
      detect(ast: ParsedWorkflow): Finding[] {
        const DB = new Set(["n8n-nodes-base.postgres","n8n-nodes-base.mysql","n8n-nodes-base.mongodb"]);
        const hasDbWrite = ast.nodes.some((n) => DB.has(n.type));
        const hasHttp = ast.nodes.some((n) => n.type === "n8n-nodes-base.httpRequest");
        if (!hasDbWrite || !hasHttp) return [];
        const hasOutbox = ast.nodes.some((n) => {
          const s = ps(n);
          return /outbox|eventSourcing|pendingEvents|outboxTable/i.test(s);
        });
        if (hasOutbox) return [];
        return [{
          id: "IDP-019-workflow", ruleId: "IDP-019",
          ruleName: "Outbox Pattern Not Used for External Calls",
          severity: "LOW", category: "IDEMPOTENCY",
          location: {},
          evidence: { summary: "DB write + HTTP call without outbox pattern", detail: "Workflow writes to DB then calls an external API in the same execution — a crash between the two leaves them inconsistent." },
          humanExplanation: "Without the outbox pattern, a crash after the DB write but before the HTTP call leaves DB and external system out of sync.",
          suggestedFix: "Write the external call intent to an 'outbox' table first. A separate worker reads and executes pending outbox entries.",
          marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-019", penaltyPoints: 5,
        }];
      },
    },

    {
      id: "IDP-020",
      name: "S3/Storage Upload Without Conditional Write",
      category: "IDEMPOTENCY",
      severity: "MEDIUM",
      description: "File upload to S3 or object storage uses overwrite mode without a conditional check.",
      enabled: true, marketplaceBlocking: false, penaltyPoints: 8,
      docReference: "https://flowintel.io/rules/IDP-020",
      detect(ast: ParsedWorkflow): Finding[] {
        const STORAGE = new Set(["n8n-nodes-base.awsS3","n8n-nodes-base.googleCloudStorage","n8n-nodes-base.s3"]);
        const findings: Finding[] = [];
        for (const node of ast.nodes) {
          if (!STORAGE.has(node.type)) continue;
          const pp = node.parameters as Record<string,unknown> | undefined;
          const op = String(pp?.operation ?? "").toLowerCase();
          if (!["upload","put","write","create"].some((v) => op.includes(v))) continue;
          const s = ps(node);
          if (!/ifNoneMatch|conditional|ETag|versionId|onlyIfAbsent/i.test(s)) {
            findings.push({
              id: fid("IDP-020", node.id), ruleId: "IDP-020",
              ruleName: "S3/Storage Upload Without Conditional Write",
              severity: "MEDIUM", category: "IDEMPOTENCY",
              location: { nodeId: node.id, nodeName: node.name, nodeType: node.type },
              evidence: { summary: "Unconditional S3 upload", detail: `"${node.name}" uploads to object storage without a conditional check — duplicate runs silently overwrite existing files.` },
              humanExplanation: "Unconditional uploads silently overwrite existing objects. In an audit trail context this destroys history.",
              suggestedFix: "Use the If-None-Match: * header to make the upload fail if the object already exists, or version the key with a content hash.",
              marketplaceBlocking: false, docReference: "https://flowintel.io/rules/IDP-020", penaltyPoints: 8,
            });
          }
        }
        return findings;
      },
    },
  ],
};
