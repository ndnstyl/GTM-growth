---
name: synthesize
description: "Pattern detection across N wiki pages. Surfaces recurring themes, contradictions, and emerging concepts that warrant their own wiki page. Sister to /ingest and /lint. Use monthly OR after every 5 substantive ingests OR when the operator asks 'what patterns are emerging?'"
---

# /synthesize, Pattern detection across the wiki

## Outputs are CANDIDATES, not commits

Critical: `/synthesize` proposes, the operator approves. NEVER auto-create concept pages or auto-resolve contradictions. The whole point is human-side curation at the strategic pattern level.

## Job map

| Job | File |
|---|---|
| Scope, triggers, invocation args | [references/scope-and-triggers.md](references/scope-and-triggers.md) |
| Step-by-step workflow (candidates → cluster → surface → present → execute → log → report), all 3 markdown templates | [references/execution-workflow.md](references/execution-workflow.md) |
| Detection heuristics (recurring theme, contradiction, missing entity, metric drift, semantic clustering) | [references/detection-heuristics.md](references/detection-heuristics.md) |
| Cadence + cost, human-in-loop rationale, constraints, anti-patterns | [references/operating-parameters.md](references/operating-parameters.md) |
| Worked example invocation | [references/example-invocation.md](references/example-invocation.md) |

Read the relevant reference file(s) before running `/synthesize`, this file is the router, not the procedure.

## Related skills

- [[ingest]], source → wiki page (input to synthesize)
- [[lint]], vault hygiene (orphans, broken links, dedup)
