---
name: goal
description: >
  Autonomous domain-routed execution. Given a goal, classify it into a work domain (Growth
  Marketing, Revenue Operations, Market Research, UI/UX Web Design, Content Creation, Visual
  Design, Data Analytics, Security and Compliance, Site Performance, System Design), load that domain's System Pack (skills + n8n workflows + memory
  context + brand rules + mechanical agents), then plan, execute full-ship, verify, and capture
  learnings. Stops only at protected gates (n8n activation/testing, outward sends, payments,
  prod deploys, db migrations).
  TRIGGERS - Use when the user says "/goal", "/goal <intent>", or gives a self-contained
  objective and wants the harness to just run it end-to-end ("source 10 leads and draft outreach",
  "make a reel about X", "build the landing page for Y"). Do NOT use for a quick question or a
  single-file edit, that is faster done directly.
---

# /goal, Domain-Routed Autonomous Execution

The single entrypoint that turns an objective into shipped work by pulling the right context, skills, workflows, and agents for its domain. It is the top layer over the existing spine (auto-memory vault + skills + n8n fleet + mechanical subagents). It is **data-driven**: behavior comes from `${CLAUDE_PLUGIN_ROOT}/systems/`, not from this file, so adding a domain never means editing this skill.

## Inputs it reads (canonical)

- `${CLAUDE_PLUGIN_ROOT}/systems/registry.yaml`, domain index + global `defaults` (autonomy, gates, agents).
- `${CLAUDE_PLUGIN_ROOT}/systems/SCHEMA.md`, the manifest contract.
- `${CLAUDE_PLUGIN_ROOT}/systems/<domain>.yaml`, the System Pack for each matched domain.
- `${CLAUDE_PLUGIN_ROOT}/systems/n8n-fleet.json`, resolve workflow IDs → name/status/domain (optional; generate it from your workflow engine, skip it if you have none).
- The vault mirror (`memory/system_*.md`, `memory/n8n_*.md`) is for the human; you read the YAML, not the mirror.

## Execution protocol

### 1. Classify
Read `registry.yaml`. Match the goal text against each domain's `entrypoints` (in its manifest) and the trigger phrases of its `skills`. Produce a ranked list of domains.
- One clear domain → proceed.
- Two or more plausible domains (cross-domain goal, e.g. "make a launch video AND the email sequence") → load BOTH packs; the goal decomposes across them.
- Genuinely ambiguous (can't tell which) → `AskUserQuestion` ONCE to pick the domain, then proceed. Do not ask twice.

### 2. Load the pack(s)
For each matched `<domain>.yaml`:
- Read every `brand_rules` page from the auto-memory vault. These are **hard constraints**, carry them verbatim into every delegation.
- Read every `memory_anchors` page, this is the domain working context.
- Resolve each `n8n_workflows` ID against `n8n-fleet.json` (skip any whose status is `superseded`/`archived`; flag if a referenced ID is missing).
- Note the pack's `skills`, `agents`, `autonomy`, `gates`, `verification`.

### 3. Vault recall
Run `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-search.py "<goal domain + nouns>" --snippets` and fold the top hits into the working context. Retrieval is a pointer, not evidence, read a note before citing it.


### 4. Plan + delegate
- If the goal is **build-shaped** (ships code / a durable artifact), generate a lightweight spec first (a short spec.md in your spec folder).
- Hand decomposition to the `orchestrator` agent. Each delegation MUST: start with the `[task_type=X]` tag (see the orchestrator agent), follow CTCO, and prepend the pack's `brand_rules` as CONSTRAINTS. Use only the pack's mechanical `agents`, never persona-skills as executors.
- Parallelize independent subtasks.

### 5. Execute at the declared autonomy, but HARD-STOP at gates
- `autonomy: full_ship` → execute, verify, capture without asking.
- `autonomy: approve_first` → present the plan, wait for one-tap approval, then execute.
- **Gates fire regardless of autonomy.** Before any gated action, STOP and hand to the operator:
  - `n8n_activation`, never activate/test a workflow yourself. Run the `n8n-check` skill, deploy the JSON if asked, then hand to the operator to activate + test. He is the only tester (n8n-rules).
  - `outward_send`, email, social post, publish to a live audience: draft it, show it, ask before sending.
  - `payment_mutation` / `prod_deploy` / `db_migration`, confirm before executing; check for existing data first (security-rules).

### 6. Verify
Run the pack's `verification` list against the output. For content, that includes the universal brand checks (no em dashes incl. `&mdash;` entities, palette/voice). Do not declare done until verification passes; if it fails, loop back to step 4.

### 7. Capture
Invoke `distill` to write the goal's learnings to auto-memory. The session-log Stop hook handles the session record. Report: domain(s) routed, skills/agents used, workflows touched, what shipped, what gated.

## Output contract (what you tell the operator at the end)

```
GOAL: <restated>
ROUTED: <domain(s)> (autonomy: full_ship)
LOADED: skills=[...] workflows=[...] brand_rules=[...]
SHIPPED: <artifacts + paths/links>
GATED: <anything handed back to the operator to send/activate, and why>
CAPTURED: <auto-memory ids>
```

## Anti-patterns

- **Routing through persona-skills as executors.** Personas are context only; the lean mechanical agents do the work.
- **Asking permission inside `full_ship`** for anything that isn't a gate. If the plan passes hard-rules and security, execute (rules/execute-now.md).
- **Self-testing n8n.** Never. Deploy + hand off.
- **Skipping the brand_rules injection.** A delegation without the pack's constraints will drift (e.g. em dashes, wrong palette, vendor voice).
- **Treating the vault mirror as source of truth.** Edit manifests in `${CLAUDE_PLUGIN_ROOT}/systems/`, then re-sync any vault mirror you keep; never hand-edit the mirror.
