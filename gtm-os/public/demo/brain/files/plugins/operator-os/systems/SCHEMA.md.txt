# System Packs, Schema & Authoring Guide

A **System Pack** is the machine-readable definition of one work **domain** (Growth Marketing, Content Creation, etc.). It declares everything `/goal` needs to work autonomously in that domain: which skills to load, which n8n workflows are relevant, which memory pages carry the context, which brand rules constrain output, which mechanical agents execute, how autonomous to run, and how to verify the work.

This directory is the **canonical, git-versioned source of truth**. If you mirror packs into your vault for humans to read, generate the mirror; never hand-edit it.

## Files in this directory

| File | Role |
|------|------|
| `SCHEMA.md` | This file, the contract. |
| `registry.yaml` | Index of all domains → manifest file + autonomy. `/goal` reads this first. |
| `n8n-fleet.json` | Optional, generated from your workflow engine. Every workflow: id, name, active, status, domain. The recall layer for workflows. |
| `<domain>.yaml` | One System Pack manifest per domain. |

## Manifest schema (`<domain>.yaml`)

```yaml
domain: content-creation          # kebab-case slug, matches filename stem
title: Content Creation           # human title
description: >                     # one paragraph: what this domain covers
  ...
autonomy: full_ship               # full_ship | approve_first
gates:                            # actions that ALWAYS stop for the operator, even in full_ship
  - n8n_activation                # never self-activate/test a workflow (the operator is the only tester)
  - outward_send                  # email / social post / publish to a live audience
  # also available: payment_mutation, prod_deploy, db_migration, data_disclosure
brand_rules:                      # memory page slugs (no .md); read + injected as hard constraints
  - no_em_dashes
  - brand_palette_discipline
skills:
  primary: [skill-a, skill-b]     # the skills this domain leads with
  support: [ingest]               # always-on helpers
agents: [implementer, researcher, reviewer]   # MECHANICAL subagents only (no personas)
n8n_workflows:                    # workflow IDs; resolved against n8n-fleet.json for names/status
  - 9WJvczLs1npwcKdr
memory_anchors:                   # memory page slugs that carry domain context
  - content_factory_notes
verification:                     # plain-language checks /goal runs before declaring done
  - "no em dashes incl &mdash; entities on the final render"
entrypoints:                      # example goals, used by the classifier to route /goal text
  - "make a reel about X"
  - "write a LinkedIn carousel"
```

## Field rules

- **domain**, kebab-case, unique, equals filename stem and the `registry.yaml` key.
- **autonomy**, `full_ship` (plan + execute + verify + capture without asking) or `approve_first` (produce a plan, wait for one-tap approval). The default is `full_ship`; only raise to `approve_first` when the whole domain is high-stakes.
- **gates**, the always-stop list. These fire regardless of `autonomy`. They map to the plugin's rules: `n8n_activation` ← rules/n8n-rules.md ("a human tests workflows"), `outward_send` ← outward-facing confirmation rule, `payment_mutation`/`prod_deploy`/`db_migration` ← rules/security.md and your deploy rules. `data_disclosure` ← your data-handling rule (sending your two most sensitive data tiers to any new destination stops for the operator).
- **skills**, names must match a real skill directory in the operator-os plugin, your project's `.claude/skills/`, or `~/.claude/skills/`. Persona-skills are NOT executors; if a domain needs a persona's knowledge, add it as a `memory_anchor` or fold the knowledge into `brand_rules`.
- **agents**, only the mechanical roster: `orchestrator`, `researcher`, `implementer`, `reviewer`, plus any specialists you add.
- **n8n_workflows**, IDs only. Keep names and status in an `n8n-fleet.json` generated from your workflow engine, so manifests never go stale on renames.
- **brand_rules / memory_anchors**, slugs that exist (or will exist) in the auto-memory vault. A slug with no page yet is allowed (creation candidate, like an unresolved `[[wikilink]]`).

## How `/goal` consumes a pack

1. Read `registry.yaml` → classify the goal into one or more `domain`s via each pack's `entrypoints` + the loaded skills' triggers.
2. Read the matching `<domain>.yaml` → read every `brand_rules` + `memory_anchors` page → resolve `n8n_workflows` against `n8n-fleet.json`.
3. Search the vault for prior notes in the domain (`${CLAUDE_PLUGIN_ROOT}/scripts/memory/vault-search.py`).
4. Hand to `orchestrator`; delegate to the pack's `agents` with pack context + brand rules prepended (CTCO).
5. Execute at the declared `autonomy`, hard-stopping at any `gates` action.
6. Run the `verification` list. Capture learnings to the vault (rules/learning-capture.md).

## Adding a new domain

1. Copy an existing `<domain>.yaml`, edit fields.
2. Add a one-line entry to `registry.yaml`.
3. Regenerate your vault mirror, if you keep one.
4. (No code change to `/goal`, it is data-driven from `registry.yaml`.)
