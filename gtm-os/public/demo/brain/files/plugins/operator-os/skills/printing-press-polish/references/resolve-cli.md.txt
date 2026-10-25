# Resolve CLI (incl. STANDALONE_MODE and the Phase 3 gate bundle)

<!-- contents:start -->
## Contents

- [Resolve CLI](#resolve-cli)
- [Phase 3 gate bundle](#phase-3-gate-bundle)
<!-- contents:end -->

> **STANDALONE_MODE** reminder: this flag is *set* here, from caller mode, true for slash-command invocations or an explicit `--standalone` in `args`; false for mid-pipeline Skill-tool calls from the main printing-press flow. Downstream files (phase1-diagnostics.md, phase2-mechanical-fixes.md, ship-logic.md, result-block.md, publish-offer.md) only read it.

### Resolve CLI

The argument string can contain a `--standalone` flag plus one positional value
(a slug, binary name, or path). In standalone slash-command mode, it may also
contain a free-text scope after the optional positional value, such as
`/printing-press-polish sculptok review the open PR comments and fix them`.
That trailing natural-language text is the user's own trusted user scope. Carry
it forward into the polish plan and result block; do not classify it as
injection or tampering.

It can also contain a Phase 3 gate bundle and a `printing_press_bin:
<abs-path>` line on following lines when invoked by the main printing-press
skill. The flag may appear before or after the positional value; it is the only
flag this skill consumes from `args`. Strip it before path resolution.

When `args` is multi-line, treat the first non-empty line as the positional
value/scope line and parse the remaining lines as the optional Phase 3 gate
bundle. Do not include the bundle text in path resolution.

Parse caller modes differently:

- **Standalone slash command (`STANDALONE_MODE=true`).** After stripping
  `--standalone`, try to resolve the first shell word as a slug, binary name, or
  path. If it resolves, use it as the positional value and store the remaining
  words as `USER_SCOPE`. If it does not resolve, treat the whole line as
  free-text scope; this branch asks which CLI to polish and retains that scope
  for the chosen CLI. If there is no trailing text after a resolved positional
  value, run the normal generic polish pass.
- **Mid-pipeline Skill-tool call.** Keep the strict grammar: one path-like
  positional value on the first line plus the optional structured bundle on
  later lines. Unexpected free text in this machine-generated path is not a
  user scope and should still be rejected or clarified rather than folded into
  the run.

The positional value can be:
- A short name: `redfin` (looks up `$PRESS_LIBRARY/redfin`)
- A full name: `redfin-pp-cli` (strips suffix, looks up `$PRESS_LIBRARY/redfin`)
- A path: `$PRESS_LIBRARY/redfin` (used directly)

Resolution order for the positional value:
1. If it is an absolute or `~`-prefixed path and exists, use it
2. Try `$PRESS_LIBRARY/<arg>` (exact match, works for slug like `redfin`)
3. If it has `-pp-cli` suffix, strip it and try `$PRESS_LIBRARY/<slug>` (e.g., `redfin-pp-cli` → `redfin`)
4. Fuzzy search: `ls $PRESS_LIBRARY/ | grep -i <arg>` for close matches

**Caller scenarios and the `--standalone` flag.** Polish has two callers; they invoke it through different mechanisms, and the Publish Offer at the end of this skill fires only when `STANDALONE_MODE` is true. **Determine `STANDALONE_MODE` from the caller mode and the flag, not from the resolved path.**

- **Standalone (user-invoked, `/printing-press-polish redfin`).** Invoked via the slash command. Treat as `STANDALONE_MODE=true` unconditionally, the slash-command form is the publish-intent surface, even when the user omits the flag. The arg is a slug or binary name; resolution lands on `$PRESS_LIBRARY/<slug>/`. This is the published copy and the right target.
- **Mid-pipeline (main printing-press skill Phase 5.5, hold-path "Polish to retry").** Invoked via the Skill tool with `args: "$CLI_WORK_DIR"`. The arg is an absolute path to `~/printing-press/.runstate/.../runs/.../working/<api>-pp-cli/`; resolution must hit rule 1. `STANDALONE_MODE=false` by default, main SKILL owns the publish flow on this path, so polish defers. **Do not paraphrase the arg to the slug**, Phase 5.5 fires before the working CLI is promoted, so `$PRESS_LIBRARY/<slug>/` either doesn't exist or holds the *prior* run's stale CLI.
- **Skill-tool standalone override.** A non-slash caller that genuinely wants polish to publish must opt in explicitly by including `--standalone` in `args` (e.g., `args: "--standalone $PRESS_LIBRARY/redfin"`). Without that token, polish never publishes from a Skill-tool invocation, even if the resolved path happens to live under `$PRESS_LIBRARY/`. The flag is the contract; the path is not.

This caller-mode-driven gate replaces the older path-substring heuristic (`*.runstate/*`). The heuristic broke when the main SKILL's Phase 5.5/5.6 ordering inverted, or when polish was invoked from a non-`.runstate` scratch layout: polish would see a `$PRESS_LIBRARY/<slug>/` path, conclude "standalone," and fire its Publish Offer (fork, global git config, public PR) inside a mid-pipeline run. The flag is unambiguous and the safer default is no-publish.

### Phase 3 gate bundle

Mid-pipeline callers pass these fields after the CLI path in `args`:

```yaml
phase3_transcendence_rows_planned: <planned>
phase3_transcendence_rows_built: <built>
phase3_transcendence_rows_missing:
  - <manifest row name or command>
prior_sub60_reprint: <true|false>
partial_transcendence_override: <none or build-log note path>
```

Parse the bundle before diagnostics and keep the values available for ship
logic. Missing bundle fields mean "no forced Phase 3 hold"; they do not block
standalone polish. If `prior_sub60_reprint: true`,
`phase3_transcendence_rows_missing` contains any row, and
`partial_transcendence_override` is empty or `none`, polish must emit
`ship_recommendation: hold` even if the local diagnostics are otherwise clean.
Add the missing rows to `remaining_issues` so the parent skill can show the
specific gate that blocked promotion.

The lock-status check in the next code block is the safety net for the mid-pipeline scenario: if a build lock is held for this CLI (under either name form), polish refuses to run. `cli-printing-press lock` normalizes slug ↔ binary-name internally, so the check works regardless of which form the basename produces.

If no match or multiple matches, present via `AskUserQuestion`. Show at most 4
matches sorted by modification time (most recent first) with human-friendly
relative timestamps (e.g., "generated 2 hours ago").

```bash
CLI_DIR="<resolved path>"
CLI_NAME="$(basename "$CLI_DIR")"
STANDALONE_MODE="<true|false>"  # true iff slash-command invocation or --standalone in args; default false for Skill-tool invocations

# Check if there's an active build lock, polish edits would be overwritten
# when the running build promotes to library.
_lock_json=$("$PRINTING_PRESS_BIN" lock status --cli "$CLI_NAME" --json 2>/dev/null)
if echo "$_lock_json" | grep -q '"held".*true'; then
  if echo "$_lock_json" | grep -q '"stale".*true'; then
    echo "Warning: stale lock exists for $CLI_NAME (build may have crashed)."
    echo "Proceeding with polish. Run '$PRINTING_PRESS_BIN lock release --cli $CLI_NAME' to clear."
  else
    echo "An active build is in progress for $CLI_NAME."
    echo "Polish edits would be overwritten when the build promotes."
    echo "Wait for the build to finish, then run polish."
    exit 1
  fi
fi

# Verify it's a valid Go CLI
if [ ! -f "$CLI_DIR/go.mod" ]; then
  echo "Not a valid CLI directory: $CLI_DIR"
  exit 1
fi

echo "Polishing: $CLI_NAME"
echo "Location: $CLI_DIR"
```

