---
name: printing-press
description: Set up a new integration, connector, or CLI binding for any API. Wrap or generate a ship-ready Go CLI from an OpenAPI, HAR, or Postman spec via the lean research -> generate -> build -> shipcheck loop. Use when the user says build a CLI, wrap this API, set up a new integration, add a connector, integrate with a service, or names an API by domain.
version: 2.0.0
min-binary-version: "4.0.0"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebFetch
  - WebSearch
  - AskUserQuestion
  - Agent
created_by: user
---

# /printing-press

Generate the best useful CLI for an API without burning an hour on phase theater.

```bash
/printing-press Notion
/printing-press Discord codex
/printing-press --spec ./openapi.yaml
/printing-press --har ./capture.har --name MyAPI
/printing-press https://postman.com/explore
/printing-press https://postman.com
```

## What Changed In v2

The old skill inflated the path to ship:
- too many mandatory research documents before code existed
- too many separate late-stage validation phases after code existed
- too many chances to discover obvious failures late

This version uses one lean loop:
1. Resolve the spec and write one research brief
2. Generate
3. Build the highest-value gaps
4. Run one shipcheck block
5. Optionally run live API smoke tests

Artifacts are still written, but only the ones that materially help the next step.

## Modes

### Default

Normal mode. Claude does research, generation orchestration, implementation, and verification.

### Codex Mode

If the arguments include `codex` or `--codex`, offload pure code-writing tasks to Codex CLI.

Use Codex for:
- writing store/data-layer code
- writing workflow commands
- fixing dead flags / dead code / path issues
- README cookbook edits

Keep on Claude:
- research and product positioning
- choosing which gaps matter
- verification results and ship decisions

If Codex fails 3 times in a row, stop delegating and finish locally.

### Polish Mode (Standalone Skill)

For second-pass improvements to an existing CLI, use the standalone polish skill:

```bash
/printing-press-polish redfin
```

See the `printing-press-polish` skill for details. It runs diagnostics, fixes verify failures, removes dead code, cleans up descriptions and README, and offers to publish.

## Rules

- **Do not ship a CLI that hasn't been behaviorally tested against real targets.** `go build` and `verify` pass-rate are structural signals, not correctness signals. Phase 5's mechanical test matrix runs every subcommand + `--json` + error paths; if that matrix was not executed, the CLI is not shippable. Quick Check is the floor; Full Dogfood is required when the user asks for thoroughness.
- **Bugs found during dogfood are fix-before-ship, not "file for v0.2".** If a 1-3 file edit resolves it, do it now. `ship-with-gaps` is deprecated as a default verdict (see Phase 4). Context is freshest in-session; a v0.2 backlog that may never be revisited ships known-broken CLIs.
- **Features approved in Phase 1.5 are shipping scope.** Do not downgrade a shipping-scope feature to a stub mid-build. If implementation becomes infeasible, return to Phase 1.5 with a revised manifest and get explicit re-approval.
- **Do not quote human-time estimates for sub-tasks** ("~15-30 min", "~1 hour", "quick fix") in `AskUserQuestion` options, phase descriptions, or reference docs. The agent does the work, not the user; agent-fabricated estimates are notoriously bad and train users to distrust the prompt. Describe scope instead (lines of code, files touched, relative size). The carve-outs are wall-clock estimates for genuinely time-bound things: the whole-CLI run (set the user's expectation up front, most CLIs take 30+ minutes), tool installs (`go install` takes ~10 seconds), and printing-press subcommands that do network-bound work (crowd-sniff scans npm + GitHub, ~5-10 minutes). Anything bounded by agent reasoning time is not time-bound, describe scope.
- **Use raw captures for contract research.** When reading official docs, auth/error/rate-limit pages, endpoint references, OpenAPI/Postman links, or source pages whose exact identifiers affect the generated CLI, read [references/fetch-docs.md](references/fetch-docs.md) and use its `fetch-docs.sh` helper. Reserve `WebFetch` for quick TL;DR reads where losing field-level details is acceptable.
- Optimize for time-to-ship, not time-to-document.
- Reuse prior research whenever it is already good enough.
- Do not split one idea across multiple mandatory artifacts.
- Durable files produced by this skill go under `$PRESS_RUNSTATE/` (working state) or `$PRESS_MANUSCRIPTS/` (archived). Short-lived command captures may use `/tmp/printing-press/` and must be removed after use.
- Do not create a separate narrative phase for dogfood, dead-code audit, runtime verification, and final score. Treat them as one shipcheck block.
- Run cheap, high-signal checks early.
- Fix blockers and high-leverage failures first.
- Reuse the same spec path across `generate`, `dogfood`, `verify`, and `scorecard`.
- YAML, JSON, local paths, and URLs are all valid spec inputs for the verification tools.
- Maximum 2 verification fix loops unless the user explicitly asks for more.

## Secret & PII Protection (Cardinal Rules)

**These rules are non-negotiable. They apply at ALL times during a run.**

API key **values**, token **values**, passwords, and session cookies must NEVER
appear in any artifact: source code, manuscripts, proofs, READMEs, HARs, or
anything committed to git. Env var **names** (e.g., `STEAM_API_KEY`) and
placeholders (e.g., `"your-key-here"`) are safe.

During Phase 5.6 (archiving) and before publishing, read and apply
[references/secret-protection.md](references/secret-protection.md) for:
- Exact-value scanning and auto-redaction of artifacts
- HAR auth stripping (headers, query strings, cookies)
- API key handling rules during the run
- Session state cleanup ordering

## Preflight

**Run [references/preflight-contract.md](references/preflight-contract.md)'s setup script now, before anything else.** That file is not passive documentation, the fenced bash block inside it IS the mandatory first executable step of every run, and it must run before any user-facing prompt, including Orientation & Briefing below. Do not invoke `AskUserQuestion`, print orientation prose, or otherwise engage the user until that script has completed and any signals from `references/setup-checks.md` have been handled.

The script resolves and exports `PRINTING_PRESS_BIN` (the absolute path every later `cli-printing-press ...` invocation in this skill and its references must use, capture it, do not rely on a bare `cli-printing-press` on `PATH`) and defines `PRESS_RUNSTATE`/`PRESS_LIBRARY`/`PRESS_MANUSCRIPTS`/`PRESS_CURRENT`. Only after it completes successfully, no `[setup-error]`, no unresolved `[upgrade-required]`, `PRINTING_PRESS_BIN` captured, should you proceed to Orientation & Briefing (first row of the Phase Router below).

## Phase Router

Every phase below lives in its own reference file. **Read and follow them in this order**, later phases assume earlier ones ran (Phase 1.5 hard-stops without Phase 1.7's marker; Phase 4 reads Phase 1.5's manifest; Phase 6 reads Phase 5.5/5.6's result block). Five variables thread across most of these files, `PRESS_RUNSTATE`, `CLI_WORK_DIR`, `PRINTING_PRESS_BIN`, `AUTH_CONTEXT`, `SOURCE_PRIORITY`, each file opens with a one-line note on which of these it reads or sets.

| # | Phase | File | Purpose |
|---|-------|------|---------|
| 0 | Preflight | [references/preflight-contract.md](references/preflight-contract.md) | Runs above, first. Resolve/upgrade the binary, detect Codex mode. |
| 1 | Orientation & Briefing | [references/orientation-briefing.md](references/orientation-briefing.md) | Parse arguments or ask for the API, sources, and auth context. |
| 2 | Run Initialization + Outputs | [references/run-init-and-outputs.md](references/run-init-and-outputs.md) | Set `CLI_WORK_DIR` and the run's artifact paths; the 5 output files. |
| 3 | Phase 0: Resolve And Reuse | [references/phase0-resolve-and-reuse.md](references/phase0-resolve-and-reuse.md) | Resolve the spec source; check for a reusable prior run. |
| 4 | Phase 1: Research Brief | [references/phase1-research-brief.md](references/phase1-research-brief.md) | Write the research brief: API identity, workflows, data layer. |
| 5 | Phase 1.6: Pre-Browser-Sniff Auth Intelligence | [references/phase1.6-auth-intelligence.md](references/phase1.6-auth-intelligence.md) | Classify the auth profile; ask about API key / browser session before sniffing. |
| 6 | Phase 1.7: Browser-Sniff Gate | [references/phase1.7-browser-sniff-gate.md](references/phase1.7-browser-sniff-gate.md) | Decide whether to capture live browser traffic; writes the marker Phase 1.5 requires. |
| 7 | Phase 1.8: Crowd-Sniff Gate | [references/phase1.8-crowd-sniff-gate.md](references/phase1.8-crowd-sniff-gate.md) | Decide whether to mine npm/GitHub for undocumented endpoints. |
| 8 | Phase 1.5: Ecosystem Absorb Gate | [references/phase1.5-absorb-gate.md](references/phase1.5-absorb-gate.md) | Mandatory stop gate: catalog every competing tool's features into the absorb manifest. |
| 9 | Phase 1.9: API Reachability Gate | [references/phase1.9-reachability-gate.md](references/phase1.9-reachability-gate.md) | One real HTTP call proving the API responds before spending generation tokens. |
| 10 | Phase 2: Generate | [references/phase2-generate-enrichment.md](references/phase2-generate-enrichment.md) | Category/cache/auth/MCP/learn enrichment, then lock and generate. |
| 11 | Phase 3: Build The GOAT | [references/phase3-build.md](references/phase3-build.md) | Build absorbed + transcendence features; 13-point Agent Build Checklist per command. |
| 12 | Phase 4: Shipcheck (+ 4.7 / 4.8 / 4.9 / 4.85 / 4.95) | [references/phase4-shipcheck.md](references/phase4-shipcheck.md) | Shipcheck umbrella, sync param-drop gate, agentic SKILL review, README/SKILL/AGENTS audit, local code review. |
| 13 | Phase 5: Dogfood Testing | [references/dogfood-testing.md](references/dogfood-testing.md) | Live test matrix against the real API; acceptance report + JSON gate markers. |
| 14 | Phase 5.5 + 5.6: Polish, Promote, Archive | [references/phase5.5-5.6-polish-promote.md](references/phase5.5-5.6-polish-promote.md) | Run `printing-press-polish`, promote to library, archive manuscripts. |
| 15 | Phase 6: Next Steps | [references/phase6-next-steps.md](references/phase6-next-steps.md) | Ship-path / hold-path menu. A run never ends without reaching this. |

## Fast Guidance

### When to use `cli-printing-press print`

Use `cli-printing-press print <api>` only when the user explicitly wants a resumable on-disk pipeline with phase seeds. It is optional.

The fast path for `/printing-press <API>` is:
- brief
- generate
- build
- shipcheck

### When to stop researching

Stop when you can answer:
- what to build first
- what data to persist
- what incumbent features cannot be missing

If the next research step does not change those answers, stop and generate.

### What not to do

Do not:
- write 5 separate mandatory research documents
- defer all workflows to "future work"
- skip verification because the CLI compiles
- treat scorecard alone as ship proof
- discover YAML/URL spec incompatibility late and manually convert specs if the tools can already consume them
- rerun the whole late-phase gauntlet for cosmetic README polish
- skip features because "the MCP already handles that" (absorb everything, beat it with offline + agent-native)
- build only "top 3-5 workflows" when the absorb manifest has 15+ (build them ALL, then transcend)
- generate before the Phase 1.5 Ecosystem Absorb Gate is approved
- call a CLI "GOAT" without matching every feature the best competitor has

### What counts as success

Success is:
- a generated CLI that gets to shipcheck without generator blockers
- verification tools working against the same spec the user generated from
- one or two fix loops, not a maze of re-entry phases
- a CLI that is plausibly shippable today, not a perfect design memo
