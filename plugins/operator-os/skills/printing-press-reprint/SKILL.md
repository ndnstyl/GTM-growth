---
name: printing-press-reprint
description: >
  Regenerate an existing printed CLI from scratch under the current Printing
  Press, with prior research, prior novel features, and prior patches
  (post-publish hand-fixes) carried into the writing pipeline as
  reconciliation context rather than dropped on the floor. Pulls the CLI
  from the public library if it isn't local, recommends reuse-vs-redo of
  prior research based on age, then hands off to /printing-press with the
  right context. Use when a machine upgrade would benefit a published CLI
  more than manual polish.
  Trigger phrases: "reprint <api>", "regenerate <api>", "redo the <api> CLI",
  "rebuild <api> from scratch", "this CLI would benefit from a reprint".
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
  - Skill
created_by: user
---

# /printing-press-reprint

Regenerate an existing printed CLI under the current machine. The user gives
a CLI name and (optionally) reasons for the reprint. This skill ensures the
prior CLI is locally present, recommends whether to reuse or redo prior
research, and hands off to `/printing-press` with the context the
novel-features subagent needs to reconcile prior features against the
current machine, keep, reframe, or drop with reasons, never silent.

```bash
/printing-press-reprint notion
/printing-press-reprint cal.com  the new MCP intent surface landed and the prior CLI ships endpoint-mirror only
/printing-press-reprint allrecipes
```

## When to run

- A significant Printing Press upgrade (new MCP surface, new auth modes, new
  transport, scoring rubric changes) would lift this CLI more than manual
  polish.
- The published CLI ships with a known systemic gap a reprint would fix.
- The user wants prior novel features re-evaluated against the current
  machine and current personas, not carried forward verbatim.

For one-off code-quality fixes, prefer `/printing-press-polish`, it doesn't
redo research or rebuild the manuscript.

## Phase router

Run these in order. Each file is self-contained; read it when you reach that
phase.

| Phase | File | Purpose |
|-------|------|---------|
| Setup | `references/setup.md` | Resolve `PRESS_HOME`, `PRESS_LIBRARY`, `PRESS_MANUSCRIPTS`, and `PRINTING_PRESS_BIN` before anything else runs. |
| A | `references/phase-a-presence-reconciliation.md` | Resolve the user's argument against the public registry, reconcile local vs. public presence via `run_id`/`generated_at`, invoke `/printing-press-import` if needed. |
| B | `references/phase-b-prior-context.md` | Locate prior `research.json` and prior patches (both index shapes), surface degraded-reprint and patch-count prompts, hold `$PATCHES_SOURCE`/`$PATCH_COUNT` for Phase D. |
| C | `references/phase-c-recency.md` | Compute research age, apply the 30/120-day recency framing, ask the user to reuse, redo, or preview prior research. |
| D | `references/phase-d-handoff.md` | Score-driven enrichment prompts, patch summarization, manifest diffing, attribution, and the library-preservation cross-reference, then hand off to `/printing-press`. |

Supporting references (not phase-ordered, pulled from within the phases above):

- `references/reference-tables.md`, the reconciliation matrix, recency
  thresholds, scorecard enrichment-dimension table, and patch-scale
  guidance, gathered for quick lookup.
- `references/templates.md`, every reusable prompt, verbatim framing
  sentence, and the Phase D handoff bundle structure, gathered for quick
  lookup.

## After hand-off

The printing-press flow drives the rest. Don't summarize its work, let
the user see the live phases.

If `/printing-press` halts with the subagent's pre-flight HALT (brief
lacks concrete `Users` / `Top Workflows` content), the reused prior brief
predates the subagent's required schema. Recommend re-running with **Redo
research** selected at Phase C.
