---
name: init-deep
description: |
  Companion mode to the built-in "init" skill (Initialize a new CLAUDE.md file
  with codebase documentation), for a subproject that already has substantial
  undocumented code rather than a blank one. Runs a parallel-agent mapping
  pass first, produces a structured set of docs, and gates every write behind
  the operator's confirmation before anything existing gets overwritten.

  TRIGGERS - Use this skill when:
  - The operator asks to "init" or "document" a subproject that already has real code
    and history (for example a vendored app or a legacy subproject that already
    has its own conventions)
  - The built-in init would otherwise overwrite or thinly template a CLAUDE.md
    over code nobody has mapped yet
  - Someone asks "what does this subproject actually do" and no doc answers it
---

# init-deep, brownfield codebase mapping before documentation

> Written 2026-08-26 from `.claude/skill-observations/log.md` Observation 16
> ("Improve init, brownfield deep mode (map + ingest + plan + summarize)").
> No local `init` skill file exists in this repo to edit directly, it is a
> built-in Claude Code skill ("Initialize a new CLAUDE.md file with codebase
> documentation"). This file is a standalone companion skill, not a patch to
> that built-in. Invoke it BEFORE running built-in `init` on a brownfield
> subproject; hand its output to `init` (or write CLAUDE.md by hand from it)
> once the operator has confirmed the map.

## Why a separate pass

Onboarding into new code and onboarding into old undocumented code are
different jobs (Observation 16's principle). Built-in `init` template-fills a
CLAUDE.md from a light scan; that is right for a small or already-legible
project. It is wrong for a subproject with years of undocumented decisions,
because a thin template read as authoritative becomes a false map, worse
than no map, per the trap this vault already tracks
( pattern: an unverified
summary reads as ground truth once written down).

This skill exists to do the mapping work first, in the open, with the human
in the loop before anything gets overwritten.

## Scope check, is this subproject brownfield-deep?

Run this only when the target actually qualifies. Ask/verify:
- Meaningful code volume relative to a placeholder repo (thousands of lines,
  not a stub)
- No current CLAUDE.md, or one that is stale/thin relative to the code
- Multiple undocumented subsystems (routes, services, config surfaces) that a
  single skim would not catch

If the subproject is small or already well documented, use built-in `init`
directly, this skill is overhead, not diligence, for that case.

## Sequence

### Phase 0, scope and confirm

State the target path (absolute) and what already exists there (existing
CLAUDE.md/README, rough file/line counts via `find`/`wc -l`, package.json or
equivalent). Ask the operator to confirm the subproject and the doc set below before
spawning anything, this phase is the first confirmation gate.

### Phase 1, parallel mapping pass (read-only)

Spawn parallel subagents (Task tool, `[task_type=meta]` for the dispatch, each
child scoped narrowly), one per structural slice of the subproject rather than
one agent reading everything serially. Typical slices for a Next.js + Node
subproject (for example `apps/legacy-admin/`):

- **Entry points and routing**, pages/app router, server.js, CLI entry
  scripts; what actually starts and what triggers what
- **Data and state**, config files (`config/apps.json`), storage/DB access,
  any schema files
- **Components/UI**, component tree, shared primitives, styling approach
- **Scripts and tooling**, `scripts/`, build/scan tooling (`scan.js`), what
  each script is for and who/what invokes it
- **External integrations**, API calls out, MCP or webhook surfaces, env vars
  consumed

Each subagent is READ-ONLY: no edits, no writes outside its own returned
report. Each returns: file paths (absolute), a plain-language summary of what
that slice does, and any claim it could not verify (flag, do not guess).

### Phase 2, synthesis (confirmation gate 2)

The orchestrating agent (or main loop) merges the subagent reports into a
single structured map, organized as:

1. **Overview**, what the subproject is, one paragraph, plain language
2. **Entry points**, how it starts, what serves what
3. **Architecture**, the pieces and how they connect (prose, not a diagram
   unless one already exists to check against)
4. **Data/config surfaces**, what's read/written and from where
5. **Known gaps**, anything a subagent flagged as unverifiable, listed by
   name, not silently dropped

Present this map to the operator before writing anything. This is the load-bearing
gate: no file gets created or overwritten past this point without an explicit
go-ahead. If the operator corrects the map, that correction is itself capture-worthy
per `learning-capture.md` (pattern recognized / architectural decision
triggers), surface it, don't just fix silently.

### Phase 3, write the structured doc set (additive first)

Once confirmed, write docs as NEW files first wherever possible:
- `<subproject>/docs/ARCHITECTURE.md` (or similar) for the Phase 2 map
- Only after that lands: propose the CLAUDE.md/README delta, shown as a diff,
  never a silent overwrite of an existing file. An existing CLAUDE.md/README
  gets a diff for approval, same rule as any other edit in this repo.

### Phase 4, handoff to built-in init

If the subproject still wants a CLAUDE.md in the standard init format, run
built-in `init` now, it has a real map to draw from instead of a cold scan,
and its output should read close to Phase 2's synthesis rather than
duplicating the mapping work.

## Rules carried over from this repo's protocol (non-negotiable)

- Subagents are read-only in Phase 1; only the main loop/orchestrator writes
  files, and only after Phase 2's confirmation gate (mirrors the
  "vault writes are main-loop-only" pattern).
- Every claim in the produced docs must trace to a file path a subagent
  actually read, no plausible-sounding filler. An unverifiable claim gets
  listed in "Known gaps," not asserted.
- Two confirmation gates minimum: Phase 0 (scope) and Phase 2 (map, before any
  write). Do not collapse them to save a turn.
- Brownfield subprojects usually already carry a CLAUDE.md: treat existing content as a starting draft to verify against the map, not as settled truth to preserve unquestioned.
