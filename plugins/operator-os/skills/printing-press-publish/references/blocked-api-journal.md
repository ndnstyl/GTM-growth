> Loaded by SKILL.md only when the invocation includes `--blocked-api-journal`.

## Blocked API Journal Mode

Use this mode only when the invocation includes `--blocked-api-journal`. It
records a held `/printing-press` attempt whose blocker is likely to repeat for
other users until a machine or upstream issue changes.

Required fields from the caller:

- `slug`: canonical API slug, not the CLI binary name.
- `attempted_at`: `YYYY-MM-DD`.
- `verdict`: `hold`.
- `reason`: concise blocker reason, with no secrets, local paths, cookies,
  tokens, or account-specific details.
- `blocking_issue`: Printing Press issue number if known, otherwise `null`.
- `permanent`: boolean.

If the caller did not provide one of these fields, infer only safe values from
the current run context. If `reason` is missing or vague, stop and ask for one
specific blocker sentence; do not write an unhelpful journal entry.

Run the normal Setup, Configuration, scoped clone cleanup, and GitHub auth
checks, then prepare the public-library clone exactly as the normal publish
flow does: fork if needed, ensure `upstream` points to
`mvanhorn/printing-press-library`, fetch `upstream`, and reset the clone to
`upstream/main` before editing.

Then update only `$PUBLISH_REPO_DIR/blocked-apis.json`:

```bash
cd "$PUBLISH_REPO_DIR"
if [ ! -f blocked-apis.json ]; then
  printf '[]\n' > blocked-apis.json
fi
jq --arg slug "<api-slug>" \
   --arg attempted_at "<YYYY-MM-DD>" \
   --arg verdict "hold" \
   --arg reason "<reason>" \
   --argjson blocking_issue '<number-or-null>' \
   --argjson permanent '<true-or-false>' '
  (if type == "array" then . else [] end)
  | map(select(.slug != $slug))
  + [{
      slug: $slug,
      attempted_at: $attempted_at,
      verdict: $verdict,
      reason: $reason,
      blocking_issue: $blocking_issue,
      permanent: $permanent
    }]
  | sort_by(.slug)
' blocked-apis.json > blocked-apis.json.tmp || {
  rm -f blocked-apis.json.tmp
  echo "Error: jq failed to update blocked-apis.json"
  exit 1
}
if ! jq empty blocked-apis.json.tmp; then
  rm -f blocked-apis.json.tmp
  echo "Error: blocked-apis.json update produced invalid JSON"
  exit 1
fi
mv blocked-apis.json.tmp blocked-apis.json
```

Create a journal branch and PR:

```bash
git checkout -B chore/blocked-api-<api-slug>
git add blocked-apis.json
git commit -m "chore(<api-slug>): journal blocked API"
git push --force-with-lease -u origin chore/blocked-api-<api-slug>
```

Open the PR against `mvanhorn/printing-press-library` with a body that includes:

- the held API slug and reason
- whether the block is permanent or tied to `blocking_issue`
- the expected Phase 0 behavior: future `/printing-press <api-slug>` runs warn
  before repeating the attempt

After the PR is open, report the URL and stop. Do not continue into normal
printed-CLI package, live-test, registry, or skill-mirror steps.
