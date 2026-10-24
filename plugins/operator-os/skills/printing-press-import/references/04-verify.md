# Phase 4, Verify internal consistency

After the move, confirm the imported CLI builds and is structurally
intact. Treat any failure as a real problem, don't paper over it.

```bash
cd "$LIB_TARGET"

# Module path is local form
grep -q "^module ${API_SLUG}-pp-cli\$" go.mod \
  || { echo "FAIL: go.mod still on public module path"; exit 1; }

# No public module path leaked into source
if grep -rq "github.com/mvanhorn/printing-press-library/library" \
   --include='*.go' --include='*.yaml' --include='*.yml' .; then
  echo "FAIL: source still references public module path"
  exit 1
fi

# Build
go build ./... \
  || { echo "FAIL: go build"; exit 1; }

# Doctor (self-check)
make doctor 2>/dev/null \
  || ./bin/${API_SLUG}-pp-cli doctor 2>/dev/null \
  || true   # best-effort; not all CLIs have doctor wired the same way
```

Report the import outcome:

- Source path (from registry: `<category>/<api-slug>`)
- Run ID (from `.printing-press.json`)
- Manuscripts run-ids placed (count + names)
- Backup zip path (if any)
- Build status
