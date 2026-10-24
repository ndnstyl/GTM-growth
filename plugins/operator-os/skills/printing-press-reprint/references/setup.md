## Setup

```bash
PRESS_HOME="${PRINTING_PRESS_HOME:-$HOME/printing-press}"
PRESS_LIBRARY="$PRESS_HOME/library"
PRESS_MANUSCRIPTS="$PRESS_HOME/manuscripts"

# Mid-pipeline callers may pass printing_press_bin: <abs-path> in the args
# bundle. Prefer it so reprint keeps using the parent skill's preflight-selected
# binary instead of re-resolving through PATH.
PRINTING_PRESS_BIN="${PRINTING_PRESS_BIN:-}"
if [ -z "$PRINTING_PRESS_BIN" ] && [ -n "${ARGUMENTS:-}" ]; then
  PRINTING_PRESS_BIN="$(printf '%s\n' "$ARGUMENTS" | sed -nE 's/^[[:space:]]*printing_press_bin:[[:space:]]*(.+)$/\1/p' | head -1)"
fi
if [ -z "$PRINTING_PRESS_BIN" ]; then
  PRINTING_PRESS_BIN="$(command -v cli-printing-press 2>/dev/null || true)"
fi

if [ -z "$PRINTING_PRESS_BIN" ]; then
  echo "cli-printing-press binary not found."
  echo "Install with:  go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest"
  return 1 2>/dev/null || exit 1
fi
echo "PRINTING_PRESS_BIN=$PRINTING_PRESS_BIN"
```
