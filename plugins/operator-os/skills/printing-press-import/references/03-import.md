# Phase 3, Import

```bash
STAGING=$(mktemp -d)

# Fetch (remote unless --from-clone was passed)
if [[ -n "${CLONE_PATH:-}" ]]; then
  bash "$SCRIPTS_DIR/import-fetch.sh" "$LIB_PATH" "$STAGING" --clone "$CLONE_PATH"
else
  bash "$SCRIPTS_DIR/import-fetch.sh" "$LIB_PATH" "$STAGING"
fi

# Backup if anything is being clobbered. Prints zip path on stdout.
if [[ -d "$LIB_TARGET" || -d "$MAN_TARGET" ]]; then
  BACKUP_ZIP=$(bash "$SCRIPTS_DIR/import-backup.sh" "$API_SLUG")
  echo "Backed up to: $BACKUP_ZIP"
fi

# Reverse the publish-step module path rewrites.
bash "$SCRIPTS_DIR/import-rewrite.sh" "$STAGING" "$API_SLUG"

# Atomically move staging into place.
bash "$SCRIPTS_DIR/import-place.sh" "$STAGING" "$API_SLUG"
```
