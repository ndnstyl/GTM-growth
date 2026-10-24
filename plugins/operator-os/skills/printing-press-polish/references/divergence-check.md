# Divergence Check (Public Library vs. Internal Copy)

### Divergence check

**Stop and run this step before Phase 1. Do not skip it. Do not proceed to diagnostics until you have completed the check and resolved any divergence.**

The internal copy at `$CLI_DIR` can drift from the public library (`mvanhorn/printing-press-library`) copy if anyone edited the public repo directly after this CLI was last published. Polishing a stale internal copy and re-publishing later silently overwrites those public-only fixes, a real failure mode that shipped CLIs hit.

**You must:**

1. **Locate the public library clone.** Honor `$PRINTING_PRESS_LIBRARY_PUBLIC` if set; otherwise scan the user's filesystem however fits this platform. Validate every candidate by checking the git remote points at `mvanhorn/printing-press-library`, other directories may share the name (forks, accidental name collisions). If multiple valid clones exist, prefer the most recently modified; ask the user to disambiguate only if still unclear.
2. **Locate this CLI inside the clone.** `find <clone>/library -type d -name "<api>-pp-cli"` or equivalent.
3. **Run `diff -r <public-cli-dir> $CLI_DIR`** with these exclusions, all of which are expected to diverge after publish:
   - `.printing-press-tools-polish.json` (local ledger, not published)
   - `.printing-press-pii-polish.json` (local ledger, not published)
   - `go.mod` and `go.sum`, publish rewrites the module path from `<api>-pp-cli` to `github.com/mvanhorn/printing-press-library/library/<category>/<api>`
   - All `.go` files where the only difference is the rewritten import path (the publish step propagates the new module path through every internal import). When inspecting `.go` diffs, scan for substantive changes, anything beyond the module-path prefix swap is real divergence.

   Concretely: `diff -r --exclude=go.mod --exclude=go.sum --exclude=.printing-press-tools-polish.json --exclude=.printing-press-pii-polish.json <public-cli-dir> $CLI_DIR`.

   Don't pass `--exclude='<api>-pp-cli'` or `--exclude='<api>-pp-mcp'`, those names match both the root-level binary files **and** the `cmd/<api>-pp-cli/` and `cmd/<api>-pp-mcp/` source directories. Excluding by binary name silently skips the entire `cmd/` subtree, hiding real divergence in `main.go`. The "Only in $CLI_DIR: <api>-pp-cli" line for the built binary is one row of expected output, not noise worth filtering at the cost of completeness.
4. **Surface the result** before continuing.

Outcomes:

- **No clone found** → user doesn't have public locally. State this explicitly ("public library not found locally; proceeding on internal as canonical") and continue.
- **Clone found but doesn't contain this CLI** → never published or under a different name. State this and continue.
- **Found and diff is empty** → in sync. State this and continue.
- **Found and divergent** → **stop**. Do not run Phase 1 diagnostics yet. List the divergent files for the user. Ask via AskUserQuestion: **sync public→internal**, or **proceed without syncing**. If the user picks sync, copy public's version of the divergent files into internal, then continue polish on the synced internal copy.

Before showing the sync prompt, check whether internal has files modified after its `.printing-press.json` timestamp (the user has been polishing locally without publishing). If yes, hedge the prompt explicitly: syncing will overwrite their pending local work. Let them decide whether to keep their local edits or pull public's.

After sync (or explicit skip), the rest of polish operates on `$CLI_DIR` as canonical. The eventual `/printing-press-publish` step pushes internal back to public; no second divergence check is needed there.

**The check has run only when one of the four outcomes above is explicitly stated in your response.** Silent omission counts as not having run it.

