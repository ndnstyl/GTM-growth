---
name: printing-press-import
description: >
  Bring a published CLI from the public library into the internal library
  so it's identical to a freshly-generated copy, module path reverted,
  manuscripts placed alongside, ready for /printing-press-polish or
  /printing-press-emboss. Use when the public library has a CLI you
  don't have locally, or to recover from a broken/lost internal copy.
  Trigger phrases: "import the CLI", "bring it into my library",
  "fetch from public library", "I don't have it locally yet".
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - AskUserQuestion
created_by: user
---

# /printing-press-import

Bring a published CLI from the public library
([`mvanhorn/printing-press-library`](https://github.com/mvanhorn/printing-press-library))
into the internal library at `$PRESS_LIBRARY/` so it matches
the form the generator would produce. Manuscripts ride along.

```bash
/printing-press-import notion
/printing-press-import cal.com
/printing-press-import allrecipes --from-clone ~/Code/printing-press-library
```

The internal library is the working copy; the public library is the
durable artifact. After import, the CLI is ready for polish, emboss, or
re-publish, the publish step will re-apply the module path rewrites.

## When to run

- The public library has a CLI you don't have locally
- The internal copy is broken, lost, or out of sync
- You want a clean baseline before running polish on a published CLI

If the user is asking to polish a CLI and mentions "in/from the public
library" or "from the repo", suggest running this skill first.

## Job map

Work through phases in order. Each row is a file under `references/`.

| Step | File | Purpose |
|------|------|---------|
| Setup | `references/setup.md` | Go toolchain check, disk-space guards, points to the 4 executable scripts |
| Phase 1, Resolve | `references/01-resolve-cli.md` | Resolve the CLI argument via `registry.json`; 3 jq match strategies in order (exact, normalized, fuzzy) |
| Phase 2, Decide overwrite | `references/02-decide-overwrite.md` | Provenance check + 4-case decision tree (same run_id / public newer / internal newer / missing provenance); ask/stop rules |
| Phase 3, Import | `references/03-import.md` | Orchestrates the 4 existing scripts: `import-fetch.sh`, `import-backup.sh`, `import-rewrite.sh`, `import-place.sh` |
| Phase 4, Verify | `references/04-verify.md` | Module path check, source leak check, `go build`, `doctor`, outcome report |
| Polish hint | `references/hint-polish.md` | Suggest `/printing-press-polish` when import was triggered by a polish ask |

The four executable scripts live alongside this SKILL.md under
`references/` and are not duplicated here, read them directly if you
need their internals:

- `references/import-fetch.sh <library-path> <staging> [--clone <path>]`
- `references/import-backup.sh <api-slug>` (prints zip path on stdout)
- `references/import-rewrite.sh <staging> <api-slug>`
- `references/import-place.sh <staging> <api-slug>`

## Flow

1. Run setup (`references/setup.md`), bail on `[setup-error]`, surface `[low-disk]` and continue.
2. Resolve the CLI (`references/01-resolve-cli.md`), get `LIB_PATH`, `API_SLUG`, `CATEGORY`.
3. Decide on overwrite (`references/02-decide-overwrite.md`), may stop and ask the user.
4. Import (`references/03-import.md`), fetch, backup, rewrite, place.
5. Verify (`references/04-verify.md`), build must pass; report the outcome.
6. If the import was triggered by a polish ask, apply the hint (`references/hint-polish.md`).
