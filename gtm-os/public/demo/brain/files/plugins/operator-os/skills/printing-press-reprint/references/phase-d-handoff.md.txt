## Phase D, Hand off to `/printing-press`

Before invoking `/printing-press`, use the prior CLI's scorecard and manifest
to decide whether the reprint should offer spec enrichment that the first print
could not have used. Reprints have better evidence than fresh prints: they know
which structural dimensions were weak, which Printing Press version produced
the prior CLI, and what the user named as the reason for regenerating.

Find the most recent scorecard JSON from the prior manuscript run. If no
scorecard artifact exists, run a fresh structural scorecard against the local
library copy:

```bash
SCORECARD_SOURCE=$(ls -1t "$PRESS_MANUSCRIPTS/$API_SLUG"/*/proofs/scorecard.json 2>/dev/null | head -1)
SCORECARD_JSON=""
if [[ -n "$SCORECARD_SOURCE" ]]; then
  SCORECARD_JSON=$(cat "$SCORECARD_SOURCE" 2>/dev/null || true)
elif [[ -d "$LIB_TARGET" ]]; then
  SCORECARD_SOURCE=$(mktemp)
  if "$PRINTING_PRESS_BIN" scorecard --dir "$LIB_TARGET" --json > "$SCORECARD_SOURCE" 2>/dev/null; then
    SCORECARD_JSON=$(cat "$SCORECARD_SOURCE" 2>/dev/null || true)
  fi
  rm -f "$SCORECARD_SOURCE"
  SCORECARD_SOURCE=""
fi
```

If `SCORECARD_JSON` is empty, continue without enrichment prompting and say the
reprint is proceeding without prior score evidence. Do not invent a prompt from
the reprint reason alone.

When `SCORECARD_JSON` is available, inspect only dimensions that map to a
pre-generation spec edit and skip dimensions that already score 10/10:

- `mcp_remote_transport`, `mcp_token_efficiency`, `mcp_tool_design`, and
  `mcp_surface_strategy` below 10 can be lifted by the `/printing-press`
  Phase 2 section **Pre-Generation MCP Enrichment**. Examples:
  - remote transport is below 10: offer `mcp.transport: [stdio, http]` or the
    OpenAPI `x-mcp.transport` equivalent before regeneration.
  - token efficiency, tool design, or surface strategy is below 10: offer the
    Phase 2 MCP surface decision, including intents for clear multi-step
    workflows or the Cloudflare pattern for large surfaces.
- `auth_protocol` below 10, or prior manifest evidence that the CLI used a
  slug-derived env var where the ecosystem has a canonical env var, can be
  lifted by **Pre-Generation Auth Enrichment**. Offer to carry canonical
  `auth.env_vars` or OpenAPI `x-auth-env-vars` guidance into the spec.
- `data_pipeline_integrity` below 10 is only an enrichment opportunity when the
  prior CLI or research shows sync-eligible resources. In that case, point the
  handoff at the relevant Phase 2 sync/cache enrichment decision rather than
  treating the score alone as proof that a local store should exist.

Use `AskUserQuestion` for each concrete opportunity before the handoff. Phrase
the question around the scorecard evidence and the named canonical section, not
around a freeform rewrite. Example:

> Prior scorecard shows `mcp_remote_transport: 5/10`. Offer MCP transport
> enrichment before regenerating, using `/printing-press` Phase 2
> **Pre-Generation MCP Enrichment** as the source of truth?

Options:

1. **Apply enrichment to the handoff** - include the selected spec edit in the
   `/printing-press` prompt so Phase 2 can update the spec before generation.
2. **Skip for this reprint** - leave the spec unchanged for this dimension.
3. **Show score evidence first** - print the relevant scorecard lines and then
   re-ask between options 1 and 2.

Do not auto-apply enrichment. If the prior scorecard already has
`mcp_remote_transport: 10/10`, do not ask the redundant MCP transport question.
If the user accepts any opportunity, add a `## Reprint Spec Enrichment`
section to the `/printing-press` handoff. Keep it brief: name the weak
dimension, the accepted enrichment, and the canonical `/printing-press` Phase 2
section to execute. Do not duplicate the canonical enrichment text here.

Invoke `/printing-press <api>` and bundle these into the prompt:

1. **A header line** stating the user already chose to regenerate, so
   Phase 0's library-check should select "Generate a fresh CLI" and not
   re-prompt fresh-vs-improve.
2. **Research mode** from Phase C (`reuse` or `redo`). Phase 0's existing
   reuse logic consumes this.
3. **The user's freeform reprint reason**, verbatim, in a `User context`
   block. This propagates into the brief as `## User Vision` and becomes
   Pass 2(e) input to the novel-features subagent, the right hook for
   "I want better MCP support" → bias the brainstorm accordingly.
4. **Reprint spec enrichment**, only when the scorecard-driven prompt above
   found an accepted opportunity. Include under a
   `## Reprint Spec Enrichment` heading.
5. **Prior patches**, only when Phase B found `$PATCH_COUNT > 0`.
   Include under a `## Prior Patches` heading.

   Lead the section with this framing sentence, verbatim:

   > The following were hand-fixed against the prior printed CLI. They
   > are informational, the machine may have absorbed some of these
   > upstream since the patch was applied. Stay aware so the fresh code
   > doesn't silently regress the underlying API truth or architectural
   > pattern, but do not treat as a re-apply checklist.

   Then summarize the patches from `$PATCHES_SOURCE`. Lead each entry
   with the *substance* the patch encodes (the API truth, the
   architectural pattern, the cross-file convention) drawn from each
   patch's `reason` and `validated_outcome`, not just `summary`. Patch
   metadata (`id`, `files`) is fine as parenthetical context but never
   the headline.

   Scale the section to patch count:

   - **1 to 3 patches**: one short paragraph per patch, substance first,
     then how it manifested. Model the shape on:
     > Linear's personal API keys go in `Authorization: lin_api_…` raw,
     > with no `Bearer` prefix; OAuth tokens use `Authorization: Bearer
     > <token>`. The prior CLI shipped with `auth set-token` only
     > (Bearer-defaulted) and was patched post-publish to add
     > `auth set-api-key` plus the raw-header path in `config.go`
     > (`linear-auth-api-key-vs-oauth-token`).
   - **4 to 9 patches**: one tight sentence per patch, same substance-first
     shape.
   - **10+ patches**: thematic summary by category (auth, pagination,
     query encoding, MCP additions, helpers, classifiers, error
     envelopes). Two or three sentences per theme citing 2 to 3 patch `id`s
     as evidence. Do not enumerate all entries inline.

   Close the section with a pointer so a downstream agent can drill into
   any specific patch when working in the relevant area:

   > Full patch detail: the per-patch files under `$PATCHES_SOURCE`
   > (each `<id>.json` is one self-contained patch; the legacy
   > single-array `.printing-press-patches.json` carries the same fields
   > under `patches[]`).

Do **not** pass a separate "this is a reprint" marker. The novel-features
subagent runs unconditionally on every print and discovers prior research
via its own discovery snippet (see
`skills/printing-press/references/novel-features-subagent.md`). The paths
import populated in Phase A are exactly the paths it checks; Pass 2(d)
fires whenever prior `research.json` exists.

The library-preservation contract is owned by `/printing-press` Phase 5.6
("Promote to Library"), not by this skill. When the existing library has
`novel_features > 0` in its manifest (or hand-authored files under
`internal/cli/`, `internal/syncer/`, or `internal/store/`), Phase 5.6 first
dry-runs `"$PRINTING_PRESS_BIN" regen-merge "$LIB_TARGET" --fresh "$CLI_WORK_DIR"
--json` to decide whether the fresh tree rebuilt the prior novels. If the
fresh tree contains all prior novel work, Phase 5.6 uses the swap path and
treats generated-file version drift as expected overwrite. Otherwise it routes
promotion through `regen-merge --apply` so still-unique hand-authored novels
survive the reprint and genuine `NOVEL-COLLISION` / missing-referent cases halt
for review. This honors the prefer-`regen-merge` guidance under the
**Hand-edits must be regen-mergeable.** section of
`skills/printing-press/SKILL.md` (anchor `hand-edit-durability`). If a future
edit to that phase changes the routing rule, update this paragraph in the same
PR -- the reprint skill is the dominant entry point that fires it.

Before the hand-off, compare regenerated manifest files against the tracked
published tree. If `$LIB_TARGET/manifest.json` or
`$LIB_TARGET/tools-manifest.json` exists, diff each file against the freshly
generated counterpart under `$CLI_WORK_DIR` and surface non-empty diffs in the
handoff prompt. Treat a diff as a reconciliation checkpoint, not as automatic
overwrite approval: The operator must decide whether to preserve the tracked
hand-edit, fold it into the spec/research inputs, or intentionally accept the
regenerated value. Do not continue silently when tracked manifest fields,
tool metadata, or descriptions would be dropped.

Attribution also stays owned by `/printing-press`: the hand-off runs generation
for the same API slug, and the generate/promote path must preserve the existing
library manifest's permanent `creator` while adding the reprinter to
`contributors[]` when they differ. Do not repair this by hand-editing
`creator`, `contributors[]`, README bylines, SKILL `author:`, or NOTICE; rerun
with a current Printing Press binary so the manifest-first guard rewrites the
working tree and promoted tree consistently.
