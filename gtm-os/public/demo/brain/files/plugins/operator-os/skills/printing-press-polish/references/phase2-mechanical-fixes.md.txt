# Phase 2 Mechanical Fixes (Priorities 0-4, 6) and Phase 3 Re-diagnose

<!-- contents:start -->
## Contents

- [Phase 2: Fix](#phase-2-fix)
  - [Runtime variant default checklist](#runtime-variant-default-checklist)
  - [Cross-cutting API-call instrumentation](#cross-cutting-api-call-instrumentation)
  - [Novel-feature data routing](#novel-feature-data-routing)
  - [Priority 0: MCP surface migration (legacy CLIs)](#priority-0-mcp-surface-migration-legacy-clis)
  - [Priority 1: Security static-analysis failures](#priority-1-security-static-analysis-failures)
  - [Priority 2: Verify failures](#priority-2-verify-failures)
  - [Priority 3: Dead code](#priority-3-dead-code)
  - [Priority 4: CLI description and metadata](#priority-4-cli-description-and-metadata)
  - [Priority 6: Remaining dogfood issues](#priority-6-remaining-dogfood-issues)
  - [After all fixes](#after-all-fixes)
- [Phase 3: Re-diagnose](#phase-3-re-diagnose)
<!-- contents:end -->

Findings fixed, skipped, or left open at each priority below feed the `fixes_applied` / `skipped_findings` / `remaining_issues` lists whose schema is defined in `references/result-block.md`, record decisions in that shape as you go, not just in this file.

## Phase 2: Fix

Fix in priority order. After each priority level, update the lock heartbeat:

```bash
"$PRINTING_PRESS_BIN" lock update --cli "$CLI_NAME" --phase polish 2>/dev/null
```

### Runtime variant default checklist

If a polish fix adds or changes a runtime mode, data-source option, auth tier, transport, or other user-visible default, document this short checklist before selecting the default:

- **User-visible default:** which behavior users get without extra flags or config.
- **Compatibility risk:** whether existing commands, scripts, MCP tools, or stored config change behavior.
- **Verification command:** the exact command that proves the default and the non-default escape hatch both work.

Keep the checklist in the polish notes or result block. Skip it for ordinary bug fixes that do not change runtime variants or defaults.

### Cross-cutting API-call instrumentation

When polish builds a feature class that must observe every outbound API call,
such as a quota ledger, request log, or audit trail, instrument the generated
client middleware in `internal/client/client.go` instead of individual command
handlers. Prefer a shared pre-dispatch hook when one exists; otherwise cover
both `do()` and `doRead()`. The `do()` path handles standard endpoint mirrors,
sync iterations, and novel features that use the generated client, while
`doRead()` handles read-only operations that ride POST-like transports, such as
GraphQL queries, JSON-RPC reads, and POST-based searches marked
`mcp:read-only`.
Per-command hooks under-count because they only see the commands polish touched.

### Novel-feature data routing

When polish adds or fixes a novel command that reads API response data into the
local store, route data through the generated typed schemas instead of writing
raw response JSON directly into tables:

1. Read `internal/types/<resource>.go` and `internal/store/<resource>.go` for the
   resource being cached. Use the typed insert/upsert helpers those files emit
   whenever they exist. If helpers are missing for a generated resource, create
   them before writing any persistence code.
2. Check the response shape against the spec schema and a real sample response
   before deciding the insert mapping is correct.
3. Decode the API response into the typed struct before persistence. Do not
   build `INSERT INTO ...` statements from untyped `map[string]any` or raw
   `json.RawMessage` values unless the table is a custom polish-owned table
   declared in hand-authored migrations; see the raw SQL exception below.
4. Verify the target table from the resource type, not from whichever query the
   novel command happened to start with. A command that fetched `<child>`
   records must insert `<child>` rows, not parent rows or a convenient adjacent
   table.
5. Normalize nested response identifiers before insert. If the API wraps the
   scalar id inside an object that also contains metadata, extract the scalar id
   field and store that value; never store the whole id object as a primary key
   or foreign-key reference.

Raw `database/sql` writes are acceptable only for custom polish-owned tables
declared in hand-authored migrations. In that case, keep the table schema
explicit in `internal/store/`, document why the generated resource helper does
not apply, and still decode nested identifiers to scalars before persistence.


_(General fix patterns referenced above, runtime variant checklist, API-call instrumentation, novel-feature data routing, live in `references/fix-patterns.md`.)_

### Priority 0: MCP surface migration (legacy CLIs)

If Phase 1's `dogfood` reported `MCP Surface: FAIL` with a parity mismatch, the CLI was generated before the runtime cobratree walker existed and is still on the static `internal/mcp/tools.go` surface. The fix is mechanical:

```bash
"$PRINTING_PRESS_BIN" mcp-sync "$CLI_DIR"
```

That migrates the MCP surface to the runtime walker, regenerates `tools-manifest.json` and `internal/mcp/tools.go`, and applies any `mcp-descriptions.json` overrides. If it exits with `mcp-sync refused` and `reprint required`, stop this polish run and hand off to `/printing-press-reprint`; the target CLI's generated client is too old for the current MCP handler, so rewriting `tools.go` alone would break its build. Include in the handoff that the reprint flow must run its normal dogfood gate against the regenerated CLI and confirm `MCP Surface: PASS` before shipping. Do not rerun dogfood against the stale `$CLI_DIR`. After a successful `mcp-sync`, re-run `dogfood` here; the parity gate should flip to PASS. Running `mcp-sync` on a compatible CLI already using the runtime walker is a no-op refresh.

Skip this priority on CLIs where dogfood's MCP gate is already passing.

### Priority 1: Security static-analysis failures

For each gosec finding in `/tmp/polish-gosec-before.json`:

1. Read the cited file and confirm whether it is hand-authored. A whole file
   under `internal/cli/`, `internal/syncer/`, or `internal/store/` whose first
   20 lines lack `Generated by CLI Printing Press` is polish-owned novel-feature
   code.
2. If the finding is in hand-authored code, fix the root cause in source before
   working lower-priority polish items. Examples: replace SQL string assembly
   with parameterized queries, avoid shelling out with untrusted args, and move
   literals that look like credentials into config/env plumbing.
3. If gosec flags generated code, do not hand-edit the generated file. Either
   fix the upstream spec and regenerate, or add a `skipped_findings` entry that
   names it as a generator retro candidate with the rule id and file path.
4. If gosec reports a false positive, keep the suppression narrow and explain
   it. Prefer a local `// #nosec G### -- reason` only when the code is actually
   safe and the reason is durable; otherwise fix the code.

Unresolved gosec findings in hand-authored novel-feature Go are hard blockers:
they must appear in `remaining_issues`, force `ship_recommendation: hold`, and
set `further_polish_recommended: yes` when the fix is plausibly mechanical.

### Priority 2: Verify failures

For each command that fails verify dry-run or exec:

1. Read the command file
2. Find `Args: cobra.ExactArgs(N)` or similar constraint
3. Remove the `Args:` field
4. Add at the top of `RunE`:
   ```go
   if len(args) == 0 {
       return cmd.Help()
   }
   ```
5. For commands needing 2+ args, use `if len(args) < 2`
6. Check for dry-run nil-data crashes and add guards:
   ```go
   if flags.dryRun {
       return nil
   }
   ```

### Priority 3: Dead code

1. For each dead function flagged by dogfood, grep all `.go` files to verify
   it's truly unused (not just its definition matching itself)
2. If truly unused: remove the function
3. If used by another helper: leave it (false positive)
4. After removal, remove unused imports
5. Delete stale files (promoted commands not registered in root.go)

### Priority 4: CLI description and metadata

1. Read root command `Short` in `internal/cli/root.go`
2. If it contains boilerplate ("Reverse-engineered...", raw API title), rewrite:
   Pattern: `"<Product> CLI with <capability-1>, <capability-2>, and <capability-3>"`
3. Check commands for missing `Example` fields. Add realistic examples with
   domain-specific values.


> Priority 5 (README) is `references/readme-standard.md`, Priority 5.5 (SKILL static-check fixes) is `references/skill-verify-fixes.md`, Priority 7 (MCP tool quality) is `references/tools-polish.md`, and Priority 8 (customer-PII gate) is `references/pii-polish.md`. Run them in numeric order between Priority 4 below and Priority 6 below.

### Priority 6: Remaining dogfood issues

- Path validity mismatches
- Auth protocol mismatches
- Example drift (examples referencing wrong commands)
- Data pipeline integrity issues


### After all fixes

```bash
go build -o "$CLI_NAME" ./cmd/"$CLI_NAME"
gofmt -w .
```

## Phase 3: Re-diagnose

> **STANDALONE_MODE** reminder: true only for slash-command invocations or an explicit `--standalone` Skill-tool call; false for mid-pipeline polish. It gates whether `publish validate` runs in this re-diagnose pass, same as in Phase 1.

Re-run the diagnostic sweep on the fixed CLI:

```bash
# RESEARCH_ARGS must travel with dogfood here too, without it,
# checkNovelFeatures doesn't re-sync novel_features_built after Phase 2
# edits, and publish-validate's transcendence gate reads stale state
# from Phase 1's pass.
"$PRINTING_PRESS_BIN" dogfood --dir "$CLI_DIR" $SPEC_FLAG "${RESEARCH_ARGS[@]}" 2>&1
"$PRINTING_PRESS_BIN" verify --dir "$CLI_DIR" $SPEC_FLAG --json 2>&1
"$PRINTING_PRESS_BIN" workflow-verify --dir "$CLI_DIR" --json 2>&1
"$PRINTING_PRESS_BIN" verify-skill --dir "$CLI_DIR" --json 2>&1
if [ "$STANDALONE_MODE" = "true" ]; then
  "$PRINTING_PRESS_BIN" publish validate --dir "$CLI_DIR" --json 2>&1
fi
"$PRINTING_PRESS_BIN" scorecard --dir "$CLI_DIR" $SPEC_FLAG 2>&1
"$PRINTING_PRESS_BIN" tools-audit "$CLI_DIR" 2>&1
"$PRINTING_PRESS_BIN" pii-audit "$CLI_DIR" "${PII_ARGS[@]}" 2>&1
go vet ./... 2>&1
if command -v gosec >/dev/null 2>&1; then
  gosec -fmt=json -out=/tmp/polish-gosec-after.json ./... 2>&1 || true
else
  go run github.com/securego/gosec/v2/cmd/gosec@v2.26.1 -fmt=json -out=/tmp/polish-gosec-after.json ./... 2>&1 || true
fi
```

Record the after scores, including the live matrix qualifier from the final `scorecard --live-check --json` output. If the gosec command fails before writing `/tmp/polish-gosec-after.json`, treat the missing post-fix scan as a polish failure: add it to `remaining_issues`, set `ship_recommendation: hold`, and include the stderr summary. If verify-skill still has any `severity=error` findings, workflow-verify still reports `workflow-fail`, publish-validate still reports `passed: false` (standalone mode only, mid-pipeline polish doesn't run this check), gosec still reports unresolved findings in hand-authored novel-feature Go, pii-audit still has pending findings or gate failures, or the final live matrix qualifier is `not_exercised`, ship cannot fire (see `references/ship-logic.md`). For a non-exercised live matrix, add a `remaining_issues` item such as `live matrix not exercised (mock-only/no live token); run the live gate before publish`.

