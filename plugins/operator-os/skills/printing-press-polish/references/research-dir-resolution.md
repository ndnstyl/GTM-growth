# Find Spec and Research Dir

### Find spec and research dir

```bash
API_SLUG="${CLI_NAME%-pp-cli}"
SPEC_PATH=""
for f in "$PRESS_HOME/manuscripts/$API_SLUG"/*/research/*.yaml "$PRESS_HOME/manuscripts/$API_SLUG"/*/research/*.json "$PRESS_HOME/manuscripts/$CLI_NAME"/*/research/*.yaml "$PRESS_HOME/manuscripts/$CLI_NAME"/*/research/*.json; do
  if [ -f "$f" ]; then
    SPEC_PATH="$f"
    break
  fi
done

# Build the spec flag once. Empty when no spec was found, diagnostic
# commands accept a missing --spec and degrade gracefully.
SPEC_FLAG=""
if [ -n "$SPEC_PATH" ]; then
  SPEC_FLAG="--spec $SPEC_PATH"
fi

# Locate the research dir. dogfood's --research-dir triggers
# checkNovelFeatures, which writes novel_features_built back into
# research.json AND syncs the verified list into .printing-press.json.
# Without this flag, legacy CLIs whose manifest predates the
# novel_features schema fail publish-validate's transcendence gate.
#
# Two layouts to handle, keyed on $CLI_DIR path structure (NOT on the
# absence of a manuscripts entry, re-generating a previously-published
# API leaves stale manuscript entries from prior runs that would point
# scorecard at the wrong research.json):
#  1. Mid-pipeline polish (invoked from the main printing-press flow
#     before promote): $CLI_DIR is under $PRESS_RUNSTATE/.../runs/<id>/working/<cli>
#     (i.e. the path contains `.runstate/`), and research.json lives at
#     $PRESS_RUNSTATE/.../runs/<id>/research.json, $CLI_DIR's grandparent.
#  2. Post-promote (standalone polish): research.json lives at
#     manuscripts/<api>/<run-id>/research.json.
RESEARCH_DIR=""
MANIFEST_RUN_ID=""
if [ -f "$CLI_DIR/.printing-press.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    MANIFEST_RUN_ID="$(jq -r '.run_id // empty' "$CLI_DIR/.printing-press.json" 2>/dev/null || true)"
  fi
  if [ -z "$MANIFEST_RUN_ID" ]; then
    MANIFEST_RUN_ID="$(sed -nE 's/.*"run_id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$CLI_DIR/.printing-press.json" | head -1)"
  fi
fi
case "$CLI_DIR" in
  *.runstate/*)
    _grandparent="$(dirname "$(dirname "$CLI_DIR")")"
    if [ -f "$_grandparent/research.json" ]; then
      RESEARCH_DIR="$_grandparent"
    fi
    ;;
  *)
    if [ -n "$MANIFEST_RUN_ID" ]; then
      for base in "$PRESS_HOME/manuscripts/$API_SLUG" "$PRESS_HOME/manuscripts/$CLI_NAME"; do
        if [ -f "$base/$MANIFEST_RUN_ID/research.json" ]; then
          RESEARCH_DIR="$base/$MANIFEST_RUN_ID"
          break
        fi
      done
    fi
    # Match publish package's fallback: API slug first, then CLI name, each
    # using the lexicographically latest run id when the manifest has none.
    if [ -z "$RESEARCH_DIR" ]; then
      for base in "$PRESS_HOME/manuscripts/$API_SLUG" "$PRESS_HOME/manuscripts/$CLI_NAME"; do
        if [ -d "$base" ]; then
          _latest="$(find "$base" -mindepth 2 -maxdepth 2 -name research.json -type f 2>/dev/null | sort | tail -1)"
          if [ -n "$_latest" ]; then
            RESEARCH_DIR="$(dirname "$_latest")"
            break
          fi
        fi
      done
    fi
    ;;
esac

# Use a bash array so the flag survives paths with spaces (e.g. when
# $HOME or $PRESS_RUNSTATE resolves through a path containing spaces).
RESEARCH_ARGS=()
if [ -n "$RESEARCH_DIR" ]; then
  RESEARCH_ARGS=(--research-dir "$RESEARCH_DIR")
fi

# pii-audit runs against the CLI dir, but publish package later copies the
# same run archive under .manuscripts/<run-id> before enforcing the PII gate.
# Pass the run dir here so polish sees the narrative manuscript files with
# the same relative paths publish will scan.
PII_ARGS=()
if [ -n "$RESEARCH_DIR" ]; then
  PII_ARGS=(--manuscripts-dir "$RESEARCH_DIR")
fi
```

