<!-- contents:start -->
## Contents

- [Phase B, Verify reconcilable prior context](#phase-b--verify-reconcilable-prior-context)
  - [Research absent](#research-absent)
  - [Patches discovery](#patches-discovery)
<!-- contents:end -->

## Phase B, Verify reconcilable prior context

Locate the two artifacts the writing pipeline should be aware of: research
(drives novel-features Pass 2(d)) and patches (post-publish hand-fixes
recorded by `/printing-press-amend`, e.g. live-discovered API quirks the
spec didn't reveal).

```bash
LIB_TARGET="$PRESS_LIBRARY/$API_SLUG"
LIB_RESEARCH="$LIB_TARGET/research.json"
MAN_RESEARCH=$(ls -1t "$PRESS_MANUSCRIPTS/$API_SLUG"/*/research.json 2>/dev/null | head -1)
```

### Research absent

If neither research path exists, the published CLI predates `research.json`
provenance. The subagent will treat the run as a first print and Pass 2(d)
reprint reconciliation will not fire, there is nothing for it to read.
Surface this and ask:

> Published `<api>` was built before `research.json` provenance landed.
> Without it, the novel-features subagent will treat this as a first
> print, there is nothing to reconcile against. Continue as a degraded
> reprint (essentially a fresh print with a kept binary name)?

If the user declines, exit. If they continue, record the absence so the
hand-off prompt notes that this is a degraded reprint.

### Patches discovery

Refresh the local patches index from public when reachable, then read
locally so downstream references are durable. Amends may have landed
against the public copy without triggering a regen, so the local copy
can lag even when `run_id` matches; this step closes that gap.

The index ships in one of two shapes: the per-patch directory
`.printing-press-patches/` (current) or the legacy single-array
`.printing-press-patches.json` (older CLIs not yet normalized). Always check
both shapes when reachable. Prefer the directory when it contains patch files,
but never let an absent legacy single-file index set `PATCH_COUNT=0` until the
directory fallback has been read.

```bash
PATCHES_DIR="$LIB_TARGET/.printing-press-patches"
PATCHES_LEGACY="$LIB_TARGET/.printing-press-patches.json"
if [[ -n "$LIB_PATH" ]]; then
  # Fetch the legacy shape if present, but do not treat a 404 as proof that no
  # patches exist. Current library entries may carry only the per-patch
  # directory below.
  tmp=$(mktemp)
  if gh api -H "Accept: application/vnd.github.v3.raw" \
       "repos/mvanhorn/printing-press-library/contents/$LIB_PATH/.printing-press-patches.json" \
       > "$tmp" 2>/dev/null; then
    mv "$tmp" "$PATCHES_LEGACY"
  else
    rm -f "$tmp"
  fi

  # Fetch the current directory shape independently. This is the required
  # fallback when `.printing-press-patches.json` is absent.
  listing=$(gh api "repos/mvanhorn/printing-press-library/contents/$LIB_PATH/.printing-press-patches" 2>/dev/null || true)
  if jq -e 'type == "array"' <<<"$listing" >/dev/null 2>&1; then
    mkdir -p "$PATCHES_DIR"
    jq -r '.[] | select(.name | endswith(".json")) | "\(.name)\t\(.download_url)"' <<<"$listing" \
    | while IFS=$'\t' read -r name url; do
        tmp=$(mktemp)
        if curl -fsSL "$url" -o "$tmp" 2>/dev/null; then
          mv "$tmp" "$PATCHES_DIR/$name"   # atomic: a dropped transfer never leaves corrupt JSON
        else
          rm -f "$tmp"
        fi
      done
  fi
fi

# Count from the first non-empty shape locally; PATCHES_SOURCE is what Phase D reads.
if [[ -d "$PATCHES_DIR" ]]; then
  DIR_PATCH_COUNT=$(find "$PATCHES_DIR" -maxdepth 1 -name '*.json' ! -name '_meta.json' | wc -l | tr -d ' ')
else
  DIR_PATCH_COUNT=0
fi
if [[ "$DIR_PATCH_COUNT" != "0" ]]; then
  PATCH_COUNT="$DIR_PATCH_COUNT"
  PATCHES_SOURCE="$PATCHES_DIR"
elif [[ -f "$PATCHES_LEGACY" ]]; then
  PATCH_COUNT=$(jq '(.patches // []) | length' "$PATCHES_LEGACY" 2>/dev/null || echo 0)
  PATCHES_SOURCE="$PATCHES_LEGACY"
else
  PATCH_COUNT=0
  PATCHES_SOURCE="$PATCHES_DIR"
fi
```

If `$PATCH_COUNT == 0` or no index is present (older CLI predating the
patches contract), skip the rest of this subsection, no patches block in
the hand-off.

If `$PATCH_COUNT > 0`, surface a one-liner to the user before continuing:

> Public `<api>` has `$PATCH_COUNT` recorded patch(es) against the prior
> printed CLI. Will carry into the brief as a watch-list (informational,
> not a re-apply mandate) so the fresh code doesn't silently regress
> live-validated fixes.

Hold `$PATCHES_SOURCE` and `$PATCH_COUNT` for Phase D.
