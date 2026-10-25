# Reusable prompts and framing sentences

Verbatim strings used at fixed points in the pipeline, gathered here so
they're easy to find and diff. The phase files remain the canonical location
that says *when* each fires.

## Degraded-reprint prompt (Phase B, research absent)

> Published `<api>` was built before `research.json` provenance landed.
> Without it, the novel-features subagent will treat this as a first
> print, there is nothing to reconcile against. Continue as a degraded
> reprint (essentially a fresh print with a kept binary name)?

## Patch-count surfacing line (Phase B, patches found)

> Public `<api>` has `$PATCH_COUNT` recorded patch(es) against the prior
> printed CLI. Will carry into the brief as a watch-list (informational,
> not a re-apply mandate) so the fresh code doesn't silently regress
> live-validated fixes.

## Phase C recency `AskUserQuestion` options

1. **Reuse prior research**, keep the prior brief; the subagent re-scores
   prior novel features against current personas
2. **Redo research**, re-run Phase 1 from scratch; the subagent still
   ingests prior novel features as Pass 2(d) input
3. **Show me first**, display the prior brief's headline + novel-features
   list, then re-ask between options 1 and 2

## Phase D scorecard-enrichment question (example)

> Prior scorecard shows `mcp_remote_transport: 5/10`. Offer MCP transport
> enrichment before regenerating, using `/printing-press` Phase 2
> **Pre-Generation MCP Enrichment** as the source of truth?

Options:

1. **Apply enrichment to the handoff** - include the selected spec edit in the
   `/printing-press` prompt so Phase 2 can update the spec before generation.
2. **Skip for this reprint** - leave the spec unchanged for this dimension.
3. **Show score evidence first** - print the relevant scorecard lines and then
   re-ask between options 1 and 2.

## Phase D prior-patches framing sentence (verbatim, leads `## Prior Patches`)

> The following were hand-fixed against the prior printed CLI. They
> are informational, the machine may have absorbed some of these
> upstream since the patch was applied. Stay aware so the fresh code
> doesn't silently regress the underlying API truth or architectural
> pattern, but do not treat as a re-apply checklist.

## Phase D worked patch-summary example (1 to 3 patch shape)

> Linear's personal API keys go in `Authorization: lin_api_…` raw,
> with no `Bearer` prefix; OAuth tokens use `Authorization: Bearer
> <token>`. The prior CLI shipped with `auth set-token` only
> (Bearer-defaulted) and was patched post-publish to add
> `auth set-api-key` plus the raw-header path in `config.go`
> (`linear-auth-api-key-vs-oauth-token`).

## Phase D prior-patches closing pointer

> Full patch detail: the per-patch files under `$PATCHES_SOURCE`
> (each `<id>.json` is one self-contained patch; the legacy
> single-array `.printing-press-patches.json` carries the same fields
> under `patches[]`).

## Phase D handoff bundle structure (what gets passed to `/printing-press <api>`)

1. **A header line** stating the user already chose to regenerate, so
   Phase 0's library-check should select "Generate a fresh CLI" and not
   re-prompt fresh-vs-improve.
2. **Research mode** from Phase C (`reuse` or `redo`).
3. **The user's freeform reprint reason**, verbatim, in a `User context` block.
4. **Reprint spec enrichment**, only when accepted; under `## Reprint Spec Enrichment`.
5. **Prior patches**, only when `$PATCH_COUNT > 0`; under `## Prior Patches`.

See `references/phase-d-handoff.md` for the full bundling rules.
