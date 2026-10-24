---
name: n8n-build
description: >
  Build, deploy and verify workflows on a self-hosted n8n instance. Carries the method: read the
  instance's ground truth first (which nodes actually load, which credentials exist, which running
  workflows are legal donors), clone working JSON instead of authoring from prose, generate
  workflows from a script, run static checks, deploy inactive, let a human test. USE THIS BEFORE
  writing a single n8n node. Triggers: "build an n8n workflow", "deploy to n8n", "fix this
  workflow", "add a node", "why is this node a ?".
---

# n8n Build: self-hosted instance

> Every rule below was paid for by a failure. Read the checklist, then build. Do not author node JSON from prose.

## Core rules

1. Local workflow JSON that is not deployed to the live instance does not exist.
2. A static audit is mandatory before every deploy: schema-level checks, not a glance.
3. Humans test workflows, agents never do. The owner of the outcome tests; the operator activates.
4. Patterns first. Never build from scratch.
5. Native n8n nodes only; the HTTP Request node is a last resort, and you say why in a sticky note.
6. Clone working JSON from a known-working workflow on THIS instance, never author from prose. Every node type and typeVersion comes from a workflow that already runs here. The API accepts invalid node types silently; a "?" node on the canvas means the build failed no matter what the API said.
7. **Cannot fail silently.** One engine is one workflow (several trigger branches allowed). Gates, retries and alerts are inline: every failure branch ends in an alert or park node in the same canvas. An external watcher is an addition, never the primary catch.

## Job router

| I need to... | Go to |
|---|---|
| Record what this instance has (version, nodes that load, credentials, donor workflows) | `references/instance-ground-truth.md` (template; fill it in once) |
| Build a new workflow, step by step | `references/build-checklist.md` |
| Understand why a node is broken | `references/traps.md` |
| Delete a workflow safely | `references/deletion.md` |
| Read live state (active workflows, credentials, executions) | `references/live-state-queries.md` |
| Run checks before deploying | `references/pre-deploy-checks.md` |

Node input/output and parameter references and template workflows are available from the community project https://github.com/haunchen/n8n-skills; check its licence before you vendor any of it. When it disagrees with your instance's own files, trust your instance.

## First run

Fill in `references/instance-ground-truth.md` from the live instance before the first build. Anything an agent does not know about the instance, it guesses, and a wrong guess ships a node that stores fine and fails at runtime.
