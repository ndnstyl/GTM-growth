# Phase 1b.i, Sniff-Finding Subroutine for `/printing-press-amend`

This reference is loaded from Phase 1's direct-input sub-section (`### 1b`) when the parsing rubric in `direct-input-parsing.md` tags an ask as `kind: sniff`. It is opt-in per run, never invoked unless the user named it. Skip this subroutine entirely when no sniff finding is present.

**Cross-cutting thread:** findings produced here carry `provenance: sniff` and merge into the same finding list shape used by `1a`/`1b`; they flow into Phase 2 and are tiered (default Tier 3) in Phase 3 like any other finding.

Triggered when the parsing rubric tags any 1b ask as `kind: sniff` (phrases like "sniff for new APIs", "find new endpoints", "discover more endpoints in <site>").

**Step 1, Resolve the target source URL.** Read the target CLI's published manifest at `~/printing-press-library/library/<category>/<slug>/.printing-press.json` and extract `source_url` (or `spec_url` as fallback). Category was resolved in 1b step 2.

If neither field is set, ask the user inline:

> "Sniff needs a target URL, paste the source site you want sniffed, or skip the sniff finding for this run?"

If the user skips, drop the sniff finding from the active list and continue with the other 1b findings. If the user pastes a URL, use it for steps 2-3.

**Step 2, Run crowd-sniff first (fast, no browser).** Replace `<PRINTING_PRESS_BIN>` with the absolute path captured at setup:

```bash
<PRINTING_PRESS_BIN> crowd-sniff --site "$SOURCE_URL" --json > /tmp/amend-sniff-crowd.json
crowd_exit=$?
```

`crowd-sniff` queries npm SDKs and GitHub code search to discover candidate endpoints, no browser required. Typical runtime is under a minute.

**Step 3, Optional browser-sniff (only when the user opted in deeper).** When the user's ask explicitly named browser-based discovery ("sniff with browser", "do a deep sniff") AND a captured HAR is already available, run:

```bash
<PRINTING_PRESS_BIN> browser-sniff --har "$HAR_PATH" --json > /tmp/amend-sniff-browser.json
browser_exit=$?
```

This skill does not orchestrate HAR capture itself in v0.2, capture is user-driven (the user opens the source site in Chrome, exports the HAR, and points the skill at it) or the deep sniff is skipped with a note. v0.3 may extend the skill to drive capture via the claude-in-chrome MCP; out of scope for v0.2.

**Step 4, Convert discoveries to findings.** For each candidate endpoint in the sniff output, append one finding to the 1b finding list:

- `id: F<n>` (next available number after the parsed asks)
- `kind: add-endpoint`
- `classification: feature`
- `evidence: "discovered via crowd-sniff: <endpoint-path>"` (or `browser-sniff` when applicable)
- `target_cli: <slug>-pp-cli`
- `rationale: <one-line summary from sniff output if available, otherwise "sniff candidate, user to confirm">`
- `provenance: sniff`

Tier these as Tier 3 (polish/architecture) at Phase 3 by default, the user reviews and can promote individual entries to Tier 2 if they're high-priority.

**Step 5, Degraded paths.**

| Condition | Behavior |
|-----------|----------|
| `.printing-press.json` lacks `source_url` AND user skips when asked | Drop sniff finding; continue with other 1b findings; log "sniff skipped, no source URL". |
| `crowd-sniff` exits non-zero | Log the error; skip sniff findings; continue with other 1b findings. Do NOT abort the amend run. |
| `crowd-sniff` returns zero candidate endpoints | Emit one entry to the deferred-findings list ("sniff ran, no new endpoints discovered") rather than adding nothing, gives the user a record. |
| Browser-sniff requested but no HAR available | Log; fall back to crowd-sniff results only. |

**Step 6, Surface provenance to the user.** At the Phase 3 scope-confirmation modal, sniff-derived findings are visually grouped under a `(sniff)` provenance tag so the user can decide whether to keep them as a group, e.g.:

```
Tier 3, Polish / architecture (5)
  F8  add-endpoint /v1/feeds/stars (sniff)
  F9  add-endpoint /v1/feeds/new (sniff)
  F10 add-endpoint /v1/feeds/activity (sniff)
  ...
```
