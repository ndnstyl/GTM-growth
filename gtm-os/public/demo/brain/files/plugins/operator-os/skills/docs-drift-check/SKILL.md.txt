---
name: docs-drift-check
description: "Read-only check of a doc's concrete claims (file paths, function/command signatures, endpoints, line-count claims) against the current source. Dispatches subagents for larger docs. Reports stale claims with the specific mismatch; applies no fixes."
---

# /docs-drift-check, doc-vs-code drift report

## When to invoke

- The operator says `/docs-drift-check <doc path>`
- Before a docs pass ships (README, AGENTS.md, a skill's own SKILL.md, any
  project doc) is considered done
- Particularly relevant to fast-moving
  code, docs drift fastest there (Observation 17,
  `.claude/skill-observations/log.md`)

## Why this exists

A documentation claim ("see `scripts/foo.py`", "runs on port 8381", "handles
GET /api/x", "the file is ~400 lines") is a testable assertion about the code.
It should be checked like one, not trusted because it reads plausibly. Nothing
in this repo currently re-verifies a doc's claims against live source before
the doc ships.

## What it is NOT

Read-only. This skill never edits the doc, never edits the code, never opens
a PR. It produces a punch-list; the operator or the requesting agent decides what to
fix.

## Step 1, extract checkable claims

Read the target doc. Pull out every claim with a concrete, verifiable form:

- File/directory paths ("see `path/to/file.ts`")
- Function/method/command signatures ("call `foo(a, b)`", "run `npm run build`")
- Endpoints/ports/routes ("POST /api/ingest", "listens on 8381")
- Line-count or size claims ("~400 lines", "the config has 12 keys")
- Named config keys, env vars, table/column names

Skip prose claims that aren't independently checkable (opinions, intent,
"why" statements), those aren't this skill's job.

## Step 2, dispatch checks

- **Small doc (roughly under ~150 checkable claims / one file's worth):**
  check directly in this session, `Read`/`Grep`/`Bash` (`wc -l`, `grep -n`,
  `find`) against the actual current source, one claim at a time.
- **Larger doc, or a doc describing multiple subsystems** (e.g. a README
  spanning several subprojects): split claims into batches by
  subsystem/file-cluster and dispatch each batch to a subagent
  (`[task_type=code_review]`). Each subagent gets: the doc excerpt, the list
  of claims to check, and the CONSTRAINTS below. It returns pass/fail per
  claim plus the mismatch detail.

## Step 3, verify each claim against current source

For each claim, run the cheapest check that actually proves or disproves it:

| Claim type | Check |
|---|---|
| File path exists | `find`/`ls`/`Read` on that exact path |
| Function/command signature | `grep -n` the definition; compare params/flags |
| Endpoint/route | `grep -rn` the route registration in the router/server file |
| Port | `grep -rn` the listen/bind call |
| Line count | `wc -l` the file, compare to the claimed figure (allow "~" claims a small tolerance, e.g. ±10%, but say so) |
| Env var / config key | `grep -rn` in the actual config-loading code, not just a `.env.example` |

Never accept a claim as verified because another doc restates it, always
check against the source the doc claims to describe, not another doc.

## Output format

```
## Docs drift report, <doc path>, YYYY-MM-DD

Claims checked: N | Stale: M | Unable to verify: K

### STALE
- Claim: "see scripts/foo.py" (line 42)
  Mismatch: file does not exist; nearest match is scripts/foo_v2.py
- Claim: "runs on port 8381" (line 10)
  Mismatch: server.js binds 8382 as of <commit/date checked>

### UNABLE TO VERIFY
- Claim: "...", reason (e.g. dynamic value, no static check available)

### CONFIRMED (count only, not itemized, unless the operator asks for the full list)
N claims matched current source.
```

## Constraints

- Read-only, always, never edit the doc or the source as part of this run
- Never mark a claim CONFIRMED without having actually run a check against
  live source in this session
- Never treat another doc, a comment, or a commit message as a substitute for
  checking the actual file/function/endpoint the claim is about
- State the exact mismatch (what the doc says vs. what the source shows), not
  just "stale", a mismatch without the diff isn't actionable
- If a claim can't be checked statically (e.g. depends on runtime state), say
  so under UNABLE TO VERIFY rather than guessing

## Anti-patterns

- Rewriting the doc "while you're in there" instead of reporting the mismatch
- Skipping claims because there are many, batch to subagents instead of
  dropping coverage
- Reporting drift found by a previous run without re-checking against the
  current source (code moves; the report must reflect now)
- Treating a doc's own prior "last verified" date as proof it's still accurate
