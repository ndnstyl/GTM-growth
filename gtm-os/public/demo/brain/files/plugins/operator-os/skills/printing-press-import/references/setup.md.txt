# Setup

```bash
PRESS_HOME="${PRINTING_PRESS_HOME:-$HOME/printing-press}"
PRESS_LIBRARY="$PRESS_HOME/library"
PRESS_MANUSCRIPTS="$PRESS_HOME/manuscripts"
SCRIPTS_DIR="$(dirname "${BASH_SOURCE[0]:-.}")/references"

if ! command -v go >/dev/null 2>&1; then
  echo ""
  echo "[setup-error] Go toolchain not found."
  echo ""
  echo "This Printing Press flow runs Go-based build or validation commands."
  echo "Install Go 1.26.6 or newer from https://go.dev/dl/, then verify with:"
  echo "  go version"
  echo "Then re-run this skill."
  echo ""
  return 1 2>/dev/null || exit 1
fi

_pp_check_disk_space() {
  _pp_disk_warn_kb="${PRINTING_PRESS_DISK_WARN_KB:-3145728}"
  _pp_disk_fail_kb="${PRINTING_PRESS_DISK_FAIL_KB:-524288}"
  case "$_pp_disk_warn_kb$_pp_disk_fail_kb" in
    ""|*[!0-9]*) return 0 ;;
  esac

  _pp_disk_path="$PRESS_HOME"
  while [ ! -e "$_pp_disk_path" ] && [ "$_pp_disk_path" != "/" ]; do
    _pp_disk_path="$(dirname "$_pp_disk_path")"
  done

  _pp_disk_avail_kb="$(df -Pk "$_pp_disk_path" 2>/dev/null | awk 'BEGIN {
    if ((getline header) <= 0 || (getline record) <= 0) exit
    field_count = split(record, fields)
    if (field_count >= 4) print fields[4]
  }')"
  case "$_pp_disk_avail_kb" in
    ""|*[!0-9]*) return 0 ;;
  esac

  if [ "$_pp_disk_avail_kb" -lt "$_pp_disk_fail_kb" ]; then
    echo ""
    echo "[setup-error] Critically low disk space on the Printing Press workspace volume."
    echo "PRESS_DISK_PATH=$_pp_disk_path"
    echo "PRESS_DISK_AVAIL_KB=$_pp_disk_avail_kb"
    echo "PRESS_DISK_FAIL_KB=$_pp_disk_fail_kb"
    echo "Free disk space or set PRINTING_PRESS_HOME to a volume with more room, then re-run this skill."
    echo ""
    return 1
  fi

  if [ "$_pp_disk_avail_kb" -lt "$_pp_disk_warn_kb" ]; then
    echo ""
    echo "[low-disk] Printing Press workspace volume is low on free space."
    echo "PRESS_DISK_PATH=$_pp_disk_path"
    echo "PRESS_DISK_AVAIL_KB=$_pp_disk_avail_kb"
    echo "PRESS_DISK_WARN_KB=$_pp_disk_warn_kb"
    echo "This flow may need several GiB for generated files, Go build cache, module downloads, or repository clones."
    echo ""
  fi
}
_pp_check_disk_space || { return 1 2>/dev/null || exit 1; }
```

The four reference scripts live alongside this SKILL.md under
`references/`:

- `import-fetch.sh <library-path> <staging> [--clone <path>]`
- `import-backup.sh <api-slug>` (prints zip path on stdout)
- `import-rewrite.sh <staging> <api-slug>`
- `import-place.sh <staging> <api-slug>`

If setup emitted `[low-disk]`, surface the advisory to the user and continue unless setup also emitted `[setup-error]`. `[low-disk]` means this run may need several GiB for repository clones, staged files, backups, Go build cache, or module downloads.
