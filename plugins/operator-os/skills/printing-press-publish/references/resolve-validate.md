> Loaded by SKILL.md for Steps 1-4. Resolves $API_SLUG and the CLI's category, then runs `publish validate`. Step 3.5 (the Greptile review contract) is intentionally not in this file, see SKILL.md's router table and `references/greptile-review-loop.md`.

## Step 1: Prerequisites

Verify `gh` is authenticated:

```bash
gh auth status
```

If this fails, stop and tell the user: "GitHub CLI is not authenticated. Run `gh auth login` first."

## Step 2: Resolve API Slug

Run:

```bash
cli-printing-press library list --json
```

Parse the JSON output into a list of CLIs. The library is now keyed by API slug (the directory name), not CLI name.

**Name resolution order** (matches the score skill for consistency):

1. **Exact match:** If the argument matches a directory name (API slug) exactly, use it
2. **CLI name match:** If no exact match, try matching against `cli_name` fields, then derive the API slug from the manifest's `api_name` field
3. **Suffix match:** If no match yet, try `<argument>-pp-cli` against `cli_name` fields
4. **Glob match:** If no suffix match, search for entries where `cli_name` or `api_name` contains the argument as a substring. Cap at 5 most-recent matches. If multiple matches, present them via AskUserQuestion and let the user pick
5. **No match:** List all available CLIs and ask the user to pick or re-enter
6. **No argument:** If invoked with no name, list all CLIs sorted by modification time and let the user pick

Once resolved, read the manifest's `api_name` field to get the API slug. Use this slug for all downstream operations (branch names, registry entries, collision detection, path construction). The `cli_name` from the manifest is only used for binary-level operations.

When presenting matches, show the API slug and modification time in a human-friendly format (e.g., "2 hours ago", "3 days ago").

## Step 3: Determine Category

Read `.printing-press.json` from the resolved CLI directory.

**Category resolution order:**

1. If the manifest has a `category` field, present it for confirmation:
   > "Publishing as **<category>**. OK?"
   Give the user the option to change it

2. If the manifest does not provide a category, present the full list via AskUserQuestion:
   - developer-tools, monitoring, cloud, project-management
   - productivity, social-and-messaging, sales-and-crm, marketing
   - payments, auth, commerce, ai, food-and-dining, health, maps, media-and-entertainment, devices, other
   - travel

## Step 4: Validate

Run:

```bash
cli-printing-press publish validate --dir <cli-dir> --json
```

`govulncheck` in this step is intentionally scoped to `<cli-dir>` only. It
uses the default `govulncheck ./...` mode so reachable symbol findings block
publish, while merely-required vulnerable modules without a call path do not
become release blockers. Do not replace this with a full public-library scan or
`govulncheck -show verbose`.

Parse the JSON result. Display each check result to the user:

```
Validating <api-slug>...
  manifest        PASS
  phase5          PASS
  go mod tidy     PASS
  govulncheck     PASS
  go vet          PASS
  go build        PASS
  --help          PASS
  --version       PASS
  manuscripts     WARN (no manuscripts found)
```

If `"passed": false`, report the failing checks and **stop**. Do not create a partial PR.
The `manifest` check is authoritative for the public-library provenance
contract: current `schema_version`, `run_id`, `printing_press_version`,
`printer`, `printer_name`, and MCP metadata files when MCP is advertised. If it
fails, tell the user to re-print or re-package with current Printing Press
metadata before opening the library PR.

Save the `help_output` field from the result, it's used in the PR description.
