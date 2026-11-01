<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:070617,55:1e1b4b,100:6366f1&height=235&section=header&text=FlowIntel&fontSize=46&fontColor=eef0ff&fontAlignY=40&desc=A%20linter%20for%20n8n%20workflows%2C%20with%20opinions&descSize=17&descAlignY=62&animation=twinkling" alt="FlowIntel" width="100%">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=19&duration=3200&pause=900&color=a5b4fc&center=true&vCenter=true&width=700&lines=341%20rules%20across%2010%20base%20packs%20and%2016%20extensions;Nine%20dimensions%2C%20one%20FQI%20score%2C%20no%20execution;Drop%20the%20JSON%2C%20get%20a%20graph%2C%20a%20fix%20list%20and%20a%20badge" alt="Typing animation" />

<br />

<a href="https://work-flow-intel.vercel.app"><img src="https://img.shields.io/badge/%E2%96%B6%20Audit%20a%20workflow-6366f1?style=for-the-badge&labelColor=070617&logo=vercel&logoColor=a5b4fc" alt="Audit a workflow" /></a>

</div>

<div align="center">

<img src="https://img.shields.io/badge/Fork%20of-Aman--Gautam67%2FFlow--Intel-818cf8?style=flat-square&labelColor=070617" alt="Fork of Aman-Gautam67/Flow-Intel" />
<img src="https://img.shields.io/badge/Licence-GPL--3.0-a5b4fc?style=flat-square&labelColor=070617" alt="GPL-3.0" />
<img src="https://img.shields.io/badge/Rules-341-6366f1?style=flat-square&labelColor=070617" alt="341 rules" />
<img src="https://img.shields.io/badge/Dimensions-9-4f46e5?style=flat-square&labelColor=070617" alt="9 dimensions" />
<img src="https://img.shields.io/badge/Executes-nothing-818cf8?style=flat-square&labelColor=070617" alt="No execution" />

</div>

<br />

<div align="center">

### <a href="https://work-flow-intel.vercel.app">work-flow-intel.vercel.app</a>

<sub>This is a <b>fork</b>. The engine was designed upstream by <a href="https://github.com/Aman-Gautam67/Flow-Intel">Aman Gautam</a>; this deployment is the fork that stays current and runs a second instance.</sub>

</div>

---

<div align="center">

## What it is

</div>

You export a workflow from n8n as JSON and drop it in. FlowIntel parses the node graph, runs it against **341 rules**, and returns an **FQI** — a Flow Quality Index from 0 to 100 — broken across nine dimensions: **health, security, simplicity, reliability, debt, memory, resilience, privacy and AI guardrails**.

Nothing is executed. There is no n8n instance attached, no credentials used, no node ever runs. It reads the JSON the way a linter reads source: the artifact is data, and everything FlowIntel knows comes from that data.

The consequence is that it is safe to point at a workflow handling live customer records — and equally that it cannot tell you whether the workflow works. It tells you whether it is *built* well.

<div align="center">

<sub>Output is not a score and a shrug: per-rule flags with file-level line references, a remediation drawer for each finding, a workflow graph, a diff view against a previous version, and a PDF report.</sub>

</div>

---

<div align="center">

## What you get

</div>

<ul>
<li><b>FQI across nine dimensions</b> — each dimension has published grading parameters, and each is shown with a popover explaining exactly what moved the number. No black box.</li>
<li><b>Rule-level findings</b> — severity, category, the offending node, and a concrete remediation. Rules are grouped into packs so a finding can be framed as a class of problem rather than a one-off.</li>
<li><b>Workflow graph</b> — the node graph rendered as a graph, so an orphaned or disconnected node is visible rather than inferred.</li>
<li><b>Quality gates</b> — thresholds you can fail a pipeline on, not just a colour on a dashboard. That is what makes it usable in CI.</li>
<li><b>Diff and drift</b> — re-analyse a later version and see which findings appeared, which were fixed, and which score dimensions moved, with a dedicated drift panel.</li>
<li><b>Badges and certificates</b> — <code>/api/badge/&lt;slug&gt;/&lt;metric&gt;.svg</code> serves a live shield for a workflow's score or dimension, and a certificate route issues a verifiable record of a pass.</li>
<li><b>CI endpoint</b> — <code>POST /api/v1/audit</code> takes a workflow and returns the report, so a repository can gate on FQI the same way it gates on tests.</li>
<li><b>MCP server</b> — <code>/api/mcp</code> exposes the analyser as tools, so an agent can audit a workflow without a browser.</li>
<li><b>Bulk workspace</b> — drop many exported workflows at once, compare, and export the results together instead of one file at a time.</li>
<li><b>Bilingual</b> — <code>en-US</code> and <code>zh-CN</code> through one i18n provider with a language switcher.</li>
</ul>

---

<div align="center">

## Stack

</div>

<ul>
<li><b>Next.js 16 + React 19 + Bun</b> — App Router, server routes for parsing and analysis, client components for the dashboard.</li>
<li><b>Drizzle + Neon Postgres</b> — workflows, versions, engagement counters and certificates.</li>
<li><b>A rule engine with a registry</b> — rules register themselves; packs are manifests; the engine never needs editing to gain a rule.</li>
<li><b>Tailwind CSS + Radix</b> — the dashboard, drawers, command palette.</li>
<li><b>Server-rendered SVG badges</b> — a badge is a route, not an image asset.</li>
</ul>

<div align="center">

<img src="https://skillicons.dev/icons?i=nextjs,react,ts,bun,postgres,tailwind,vercel,git" alt="Next.js, React, TypeScript, Bun, Postgres, Tailwind, Vercel, Git" />

</div>

---

<div align="center">

## Under the hood

</div>

<details>
<summary><b>A registry that fails fast</b> — why rule IDs are permanent</summary>

<br />

<p>Every rule is a map entry, and registering a duplicate throws at module load:</p>

<pre><code>register(rule: RuleDefinition): void {
  if (this.rules.has(rule.id)) {
    throw new Error(
      `[RuleRegistry] Duplicate rule ID "${rule.id}". Rule IDs are permanent — ` +
      `rename the new rule or deregister the existing one first.`
    );
  }
  this.rules.set(rule.id, rule);
}</code></pre>

<p>The strictness is the point. A finding's identity is its rule ID; if IDs could be reused, every historical report, diff and badge would silently change meaning. Failing at startup is cheap; a diff that lies is not.</p>

<p>Packs are registered the same way, and a duplicate pack ID throws too. Adding a category of checks is a new file plus one line in <code>rule-packs/index.ts</code>.</p>

</details>

<details>
<summary><b>341 rules, ten packs, sixteen extensions</b></summary>

<br />

<p>The packs cover <b>security, reliability, idempotency, observability, maintainability, performance, compatibility, privacy, documentation and cost optimisation</b>. Each ships a base pack plus zero or more <code>-ext</code> files — security, reliability, privacy, performance and maintainability carry two extensions each.</p>

<p>So the extension files are not residue, they are the growth path: the base pack stays readable as the canonical set for a category, and new rules land beside it in an extension pack without turning one file into an unreadable list. Counted from the pack sources, that is <b>341 unique rule IDs</b>.</p>

</details>

<details>
<summary><b>Nine dimensions, and why they are not the rule packs</b></summary>

<br />

<p>The rule packs are how checks are <i>organised for authors</i>. The nine dimensions are how scores are <i>organised for readers</i>. They are different axes on purpose:</p>

<ul>
<li><b>Dimensions</b> — health, security, simplicity, reliability, debt, memory, resilience, privacy, ai_guard. These are what the ring grid shows and what the FQI aggregates.</li>
<li><b>Packs</b> — where a rule lives. One pack can feed several dimensions; one dimension draws from several packs.</li>
</ul>

<p>Each dimension publishes its grading parameters — the actual node properties and conditions the engine inspects. "Security dropped 12 points" is only useful if you can read what "security" measures, so that text ships with the app rather than living in a wiki.</p>

</details>

<details>
<summary><b>Two analysis paths, one output shape</b></summary>

<br />

<p>The newer engine returns a v2 <code>AnalysisReport</code>; the original UI was built against a v1 <code>ScoreBreakdown</code>. Rather than rewrite the UI or fork the engine, an adapter bridges them:</p>

<pre><code>ParsedWorkflow → analysis-runner → AnalysisReport → adapter-bridge → ScoreBreakdown
                                   (v2 attached as scores._v2Report)</code></pre>

<p>The sync path is kept deliberately: an upload preview runs client-side and cannot await a SHA-256 fingerprint or a database write. So <code>analyze()</code> uses the sync fallback and returns immediately, while <code>analyzeAsync()</code> is used by server routes where the fingerprint is written to Postgres. Same rules, same scores — one of them just knows less about identity.</p>

</details>

<details>
<summary><b>Static means static</b></summary>

<br />

<p>No workflow is imported into n8n, no credential is decrypted, no node is invoked. Everything is computed from the exported JSON: node types, parameters, graph edges, and the presence or absence of configuration.</p>

<p>That constraint is why the security rules can be specific without being reckless — checking that a webhook node has <code>authentication === 'none'</code> is a static property, not a probe.</p>

</details>

---

<div align="center">

## Project structure

</div>

<pre><code>Flow-Intel/
├── src/app/
│   ├── page.tsx  search/  upload/
│   ├── workflows/[slug]/        # dashboard + diff
│   └── api/
│       ├── parse  v2/analyze  v1/audit
│       ├── badge/[slug]/[metric]   # live SVG
│       ├── v2/certificate/[id]  v2/marketplace/*
│       ├── mcp                      # agent tools
│       └── workflows/[slug]/engage
├── src/lib/engine/
│   ├── registry.ts  rule-engine.ts  quality-gates.ts
│   ├── rule-packs/                  # 10 base + 16 extension packs
│   └── analysis-runner.ts  adapter-bridge.ts  passport.ts
├── src/lib/analyzer/                # v1 rules, one per dimension
└── src/config/dimensions.ts         # the nine dimensions, documented</code></pre>

---

<div align="center">

## Run it

</div>

<pre><code>git clone https://github.com/Jivaansh-Yadav/Flow-Intel.git
cd Flow-Intel
bun install
bun run dev            # next dev</code></pre>

<p>A Neon <code>DATABASE_URL</code> is needed for persistence — workflow history, engagement and certificates. Analysis itself runs without it; you lose the archive, not the audit.</p>

<div align="center">

<sub><b>Built-by :</b> <a href = "github.com/Jivaansh-Yadav"> Jivaansh </a> and <a href = "github.com/Aman-Gautam67"> Aman </a>.<br> <b>License :</b> GPL-3.0. This fork keeps the licence and the attribution; the deployment, the badge/certificate routes and the MCP surface are what it adds on top.</sub>

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:070617,55:1e1b4b,100:6366f1&height=110&section=footer&reversal=true" alt="" width="100%">
