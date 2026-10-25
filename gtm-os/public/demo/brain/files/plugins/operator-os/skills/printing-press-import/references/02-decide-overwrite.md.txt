# Phase 2, Decide on overwrite

Check whether the internal library already has this CLI:

```bash
LIB_TARGET="$PRESS_LIBRARY/$API_SLUG"
MAN_TARGET="$PRESS_MANUSCRIPTS/$API_SLUG"
```

**If neither exists:** straightforward import, proceed to Phase 3.

**If either exists:** read provenance from both sides to decide whether
to overwrite. Don't read whole `.printing-press.json` files, pull just
the fields that matter:

```bash
# Internal provenance (if present):
jq '{run_id, generated_at, printing_press_version, spec_checksum}' \
  "$LIB_TARGET/.printing-press.json" 2>/dev/null

# Public provenance (one-shot via raw):
gh api -H "Accept: application/vnd.github.v3.raw" \
  repos/mvanhorn/printing-press-library/contents/$LIB_PATH/.printing-press.json \
  | jq '{run_id, generated_at, printing_press_version, spec_checksum}'
```

Reason over the diff:

- **Same `run_id`**, public is the same generation as internal. Likely
  no-op; ask before clobbering. If the user wants to import anyway
  (e.g., to recover from a broken internal copy), proceed.
- **Public newer `generated_at`**, public has changes the internal
  doesn't. Importing is the safe move; ask the user to confirm.
- **Internal newer `generated_at`**, internal has work the public
  doesn't (in-progress polish, manual fixes). Importing would clobber
  that. Stop and surface this to the user, they likely want to publish
  the internal changes first.
- **Either side missing `.printing-press.json`**, older or hand-imported.
  Ask the user.

When the user confirms overwrite, the backup step in Phase 3 captures
the current internal state.
