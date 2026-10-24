---
name: data-classification
description: |
  Classify any data, document, prompt, or workflow against the org's data tiers
  (T0 Privileged/Regulated, T1 Confidential/Proprietary, T2 Internal, T3 Public)
  and decide which AI tools and destinations are allowed. Enforces the privileged-data
  line: privileged and proprietary data never enters a consumer AI interface.
  Use before piping data into any AI tool, before onboarding a new data
  processor, before sharing assets with a prospect, or when auditing whether an
  existing pipeline (client RAG, outreach, billing) handles sensitive data
  correctly.
triggers:
  - "/classify"
  - "classify this data"
  - "what tier is this"
  - "can I put this in ChatGPT / Claude / Gemini"
  - "is this safe to send to an AI tool"
  - "data classification"
  - "privileged-data check"
  - "is this privileged"
  - "can I share this with the prospect / client"
license: proprietary
metadata:
  owner: ciso
  domain: security-compliance
  version: "1.0"
---

# Data Classification & AI-Boundary Enforcer

The job: take any artifact (a document, a dataset, a prompt, a workflow, a
proposed share) and answer two questions deterministically.

1. **What tier is it?** (T0 / T1 / T2 / T3)
2. **Where is it allowed to go?** (which AI tools, which destinations, gated or not)

Authority: your project's data-handling rule (this skill is its executable form). This skill is the executable form of
that rule. When they disagree, the rule wins and this skill gets corrected.

## Step 1, Classify

Walk the tier table top-down and stop at the first match (highest tier wins).

- **T0, Privileged / Regulated** if ANY of: attorney-client privileged or
  work-product material (e.g. a law-firm client's docs), regulated data (cardholder
  data, PHI), or data under a client confidentiality/DPA obligation.
- **T1, Confidential / Proprietary** if ANY of: our prompts, agent/system
  architecture, roadmap, client lists, pricing models, unreleased builds, or
  third-party PII (leads, contacts).
- **T2, Internal** if non-sensitive operational data, drafts, internal notes.
- **T3, Public** if already published or built for public release.

If you cannot confidently name the tier, classify it **T1** and say so.

## Step 2, Route

Apply the AI-tool routing matrix from `data-handling.md`:

- **T0**: governed pipeline ONLY (DPA + retention controls + access logging).
  Privileged data stays inside the client/firm control boundary. Never a
  consumer UI. Commercial API only if the client has approved that exact
  processor under DPA.
- **T1**: never a consumer chat UI. Commercial API (no-train) allowed only if the
  processor is on the approved subprocessor register. Governed pipeline preferred.
- **T2**: commercial API fine; strip identifiers before any consumer UI.
- **T3**: anywhere.

For a proposed external share (prospect/client/vendor), also check the
protect-IP-before-ink rule: pre-contract, share outputs (T3/sanitized T2), never
mechanisms (T1).

## Step 3, Verdict

Return a short, decisive verdict. Do not hedge.

```
TIER:        T1, Confidential / Proprietary
REASON:      Contains a client lead-scoring prompt + scoring weights (our IP).
ALLOWED:     Anthropic commercial API (no-train), on register. Internal n8n pipeline.
BLOCKED:     claude.ai / ChatGPT app / any consumer UI. External share pre-contract.
GATE:        none (internal API use). data_disclosure gate if shared externally.
PRIVILEGE:   N/A (not privileged) but proprietary, consumer-UI paste would risk IP.
ACTION:      Use the API path. If a new processor is needed, register it first.
```

For a T0 example (a client's privileged legal document):

```
TIER:        T0, Privileged / Regulated
REASON:      Attorney-client privileged client document under the firm DPA.
ALLOWED:     Governed client RAG pipeline only (within firm control boundary).
BLOCKED:     ALL consumer UIs. Any processor not named in the firm's DPA.
GATE:        data_disclosure, any new destination stops for the operator + client sign-off.
PRIVILEGE:   DIRECT. Consumer-AI processing would waive privilege + make it
             discoverable. This is the exact fact pattern the court ruled on.
ACTION:      Keep inside the pipeline. Do not export. Confirm processor is on the
             firm's approved subprocessor list before any embedding/inference run.
```

## When auditing an existing pipeline

For a client RAG, outreach, or billing flow, trace every hop where data
leaves our control: which node, which API, which processor, what retention. Flag
any hop where T0/T1 data reaches a processor not on the register or not under DPA.
Output the same verdict format per hop, worst tier first.

## Sources to port from (free, vet before importing)

- GRC control language: `Sushegaad/Claude-Skills-Governance-Risk-and-Compliance`
  (GDPR, EU AI Act, ISO 42001 mapping for AI-processing boundaries).
- Do not blind-install. Port control text into our tiers + voice; keep the
  a privileged-data framing, which generic repos lack.
