> Loaded by SKILL.md for Step 4.5. Reruns the live behavioral gate against the CLI about to be published and writes a fresh Phase 5 acceptance (or skip) marker.
>
> **Cross-reference:** `references/package.md` (Step 6) refuses to package when the Phase 5 marker's source fingerprint does not match the current tree. This step is what writes that fingerprint, to both the embedded and archived proofs copies, re-run this gate after every source change, before packaging.

## Step 4.5: Live End-to-End Gate

Before touching the managed publish clone, rerun the live behavioral gate
against the CLI that is about to be published. Step 4 proves the source builds
and validates structurally; this step proves the current post-edit tree still
works against the real upstream API. Do not rely on an older
`phase5-acceptance.json` from generation or polish because the CLI may have
been hand-edited since that marker was written.

**Marker invalidation and sync.** The acceptance marker carries a source
fingerprint; any `.go` edit after it was written makes `publish package` fail
with "phase5 marker source fingerprint does not match". Re-run this live gate
after every source change and write the marker to **both** copies: the embedded
`$CLI_DIR/.manuscripts/<run>/proofs/` and the archived
`$PRESS_MANUSCRIPTS/<api>/<run>/proofs/` (manuscript lookup is archive-first;
proof lookup is embedded-first, a stale copy in either location blocks
packaging).

Resolve the Phase 5 proofs directory from the CLI manifest:

```bash
MANIFEST="$CLI_DIR/.printing-press.json"
API_SLUG=$(jq -r '.api_name // empty' "$MANIFEST")
CLI_NAME=$(jq -r '.cli_name // empty' "$MANIFEST")
RUN_ID=$(jq -r '.run_id // empty' "$MANIFEST")
AUTH_TYPE=$(jq -r '.auth_type // "none"' "$MANIFEST")
AUTH_ENV=$(jq -r '.auth_env_vars[0] // empty' "$MANIFEST")

if [ -z "$API_SLUG" ] || [ -z "$RUN_ID" ]; then
  echo "ERROR: manifest is missing api_name or run_id; cannot run publish live gate."
  exit 1
fi

PROOFS_DIR="$CLI_DIR/.manuscripts/$RUN_ID/proofs"
if [ ! -d "$PROOFS_DIR" ] && [ -n "$API_SLUG" ] && [ -d "$PRESS_MANUSCRIPTS/$API_SLUG/$RUN_ID/proofs" ]; then
  PROOFS_DIR="$PRESS_MANUSCRIPTS/$API_SLUG/$RUN_ID/proofs"
elif [ ! -d "$PROOFS_DIR" ] && [ -n "$CLI_NAME" ] && [ -d "$PRESS_MANUSCRIPTS/$CLI_NAME/$RUN_ID/proofs" ]; then
  PROOFS_DIR="$PRESS_MANUSCRIPTS/$CLI_NAME/$RUN_ID/proofs"
fi
mkdir -p "$PROOFS_DIR"

RESEARCH_DIR="$(dirname "$PROOFS_DIR")/research"
if [ ! -f "$RESEARCH_DIR/research.json" ] && [ -f "$(dirname "$PROOFS_DIR")/research.json" ]; then
  RESEARCH_DIR="$(dirname "$PROOFS_DIR")"
fi
if [ ! -f "$RESEARCH_DIR/research.json" ]; then
  echo "ERROR: publish live gate requires the run research.json at $RESEARCH_DIR." >&2
  exit 1
fi
```

Phase 5 markers are bound to the source tree that was exercised. The live
dogfood writer records `source_fingerprint` and per-file hashes automatically.
Publish validation recomputes the fingerprint from the current CLI directory
and refuses a marker from a drifted tree, naming changed source files when the
marker has them. README-only edits are outside this fingerprint and do not
invalidate the gate.

If `SKIP_LIVE_TEST_REASON` is unset, run full live dogfood and write a fresh
acceptance marker into that proofs directory:

```bash
LIVE_GATE_JSON="$PROOFS_DIR/publish-live-gate.json"
LIVE_GATE_ARGS=(
  dogfood
  --dir "$CLI_DIR"
  --live
  --level full
  --timeout 120s
  --research-dir "$RESEARCH_DIR"
  --write-acceptance "$PROOFS_DIR/phase5-acceptance.json"
  --json
)
if [ -n "$AUTH_ENV" ]; then
  LIVE_GATE_ARGS+=(--auth-env "$AUTH_ENV")
fi

rm -f "$PROOFS_DIR/phase5-skip.json"
if ! "$PRINTING_PRESS_BIN" "${LIVE_GATE_ARGS[@]}" >"$LIVE_GATE_JSON"; then
  echo "Publish live gate failed. See $LIVE_GATE_JSON and $PROOFS_DIR/phase5-acceptance.json."
  jq -r '.tests[]? | select(.status == "fail") | "- \(.command) [\(.kind)]: \(.reason // "failed")"' "$LIVE_GATE_JSON" 2>/dev/null || true
  exit 1
fi
```

On failure, stop exactly like Step 4's `passed: false`: no managed clone, no
branch, no package, no PR. Report the failed command, exit code when present,
stderr or reason snippet, and the path to the fresh proof files so the operator
can re-run dogfood and fix the CLI.

If `SKIP_LIVE_TEST_REASON` is set from `--skip-live-test=<reason>`, write a
fresh skip marker instead of running dogfood:

```bash
SKIP_REASON_LOWER=$(printf '%s' "$SKIP_LIVE_TEST_REASON" | tr '[:upper:]' '[:lower:]')
case "$AUTH_TYPE" in
  api_key|bearer_token|oauth2)
    ;;
  none)
    case "$SKIP_REASON_LOWER" in
      *upstream*outage*|lan-unreachable-from-generation-host)
        ;;
      *)
        echo "ERROR: --skip-live-test is only valid for auth_type=none during a known upstream outage or LAN-unreachable hardware case."
        exit 1
        ;;
    esac
    ;;
  *)
    echo "ERROR: --skip-live-test is not valid for auth_type=$AUTH_TYPE. Run the live gate instead."
    exit 1
    ;;
esac

API_KEY_AVAILABLE=false
if [ -n "$AUTH_ENV" ] && [ -n "${!AUTH_ENV:-}" ]; then
  API_KEY_AVAILABLE=true
fi

SOURCE_FILES=$(find "$CLI_DIR" \( -type d \( -name '.git' -o -name '.manuscripts' -o -name '.printing-press' \) -prune \) -o -type f \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' -o -name 'spec.json' -o -name 'spec.yaml' -o -name 'spec.yml' \) -print | LC_ALL=C sort)
SOURCE_FINGERPRINT=$(
  while IFS= read -r SOURCE_FILE; do
    [ -z "$SOURCE_FILE" ] && continue
    SOURCE_REL="${SOURCE_FILE#"$CLI_DIR"/}"
    SOURCE_HASH=$(shasum -a 256 "$SOURCE_FILE" | sed 's/[[:space:]].*//')
    printf '%s\0%s\n' "$SOURCE_REL" "$SOURCE_HASH"
  done <<EOF | shasum -a 256 | sed 's/[[:space:]].*//'
$SOURCE_FILES
EOF
)
if [ -z "$SOURCE_FINGERPRINT" ]; then
  echo "ERROR: unable to fingerprint CLI source before writing the Phase 5 skip marker."
  exit 1
fi

rm -f "$PROOFS_DIR/phase5-acceptance.json"
jq -n \
  --arg api "$API_SLUG" \
  --arg run "$RUN_ID" \
  --arg reason "$SKIP_LIVE_TEST_REASON" \
  --arg auth "$AUTH_TYPE" \
  --arg source_fingerprint "$SOURCE_FINGERPRINT" \
  --argjson api_key_available "$API_KEY_AVAILABLE" \
  --argjson browser_session_available false \
  '{
    schema_version: 1,
    api_name: $api,
    run_id: $run,
    status: "skip",
    level: "none",
    source_fingerprint: $source_fingerprint,
    skip_reason: $reason,
    auth_context: {
      type: $auth,
      api_key_available: $api_key_available,
      browser_session_available: $browser_session_available
    }
  }' > "$PROOFS_DIR/phase5-skip.json"
if [ "$SKIP_REASON_LOWER" = "lan-unreachable-from-generation-host" ]; then
  tmp_marker=$(mktemp "${TMPDIR:-/tmp}/phase5-skip.XXXXXX")
  jq '.auth_context.local_network_only = true' "$PROOFS_DIR/phase5-skip.json" > "$tmp_marker" &&
    mv "$tmp_marker" "$PROOFS_DIR/phase5-skip.json"
fi
LIVE_GATE_JSON=""
```

Then rerun Step 4's validation:

```bash
"$PRINTING_PRESS_BIN" publish validate --dir "$CLI_DIR" --json
```

This second validation proves the fresh acceptance or skip marker satisfies the
same Phase 5 contract that package and publish rely on. If it fails, stop
before Step 5.
