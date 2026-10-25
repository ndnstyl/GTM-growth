# README Standard (Priority 5)

### Priority 5: README

**Cardinal rule: run `<cli> <cmd> --help` for EVERY command you put in the
README.** Never guess flag names, argument formats, or valid values. If you
write `--start-time` but the flag is `--start`, the README is wrong and
users will get errors on their first try.

#### Source-of-truth files for rendered sections

Before editing README.md, SKILL.md, or `.printing-press.json`, identify whether
the section is rendered from a source file. Dogfood and regeneration overwrite
these rendered sections, so direct edits there are temporary and should be used
only to inspect the current output.

| Rendered section or field | Source-of-truth file::field | Polish workflow |
| --- | --- | --- |
| README `## Unique Features` | `research.json::novel_features_built[]` | Edit the underlying `research.json` feature description/example, then re-run dogfood with `--research-dir`. |
| SKILL `## Unique Capabilities` | `research.json::novel_features_built[]` | Edit the underlying `research.json` feature description/example, then re-run dogfood with `--research-dir`. |
| README Quick Start | `research.json::narrative.quickstart[]` | Edit the command/comment in `research.json`, then regenerate or re-run the dogfood/rendering step. |
| SKILL Recipes | `research.json::narrative.recipes[]` | Edit the recipe title, command, or explanation in `research.json`, then regenerate or re-run the dogfood/rendering step. |
| README/SKILL Troubleshooting | `research.json::narrative.troubleshoots[]` | Edit the symptom/fix pair in `research.json`, then regenerate or re-run the dogfood/rendering step. |
| `.printing-press.json` `display_name`, `description`, `mcp_*` | `WriteManifestForGenerate`; for description/display-name overrides, edit the spec (`info.title`, `info.x-display-name`, `info.description`) | Edit the spec or rerun the manifest writer. Do not hand-edit generated manifest metadata unless you are doing temporary diagnosis. |

Recommended loop for these rendered sections: edit the source field, re-run
dogfood with `--research-dir "$RESEARCH_DIR"` or regenerate the CLI as
appropriate, then run a second pass to confirm the rendered README/SKILL text
stays fixed. If you edit README.md or SKILL.md directly in one of these
sections, expect the next dogfood resync or regeneration to clobber the change.

To find the manuscript source:

```bash
PRESS_HOME="${PRINTING_PRESS_HOME:-$HOME/printing-press}"
API_SLUG="${CLI_NAME%-pp-cli}"
RESEARCH_JSON=""
for f in "$PRESS_HOME/manuscripts/$CLI_NAME"/*/research.json \
         "$PRESS_HOME/manuscripts/$API_SLUG"/*/research.json; do
  if [ -f "$f" ]; then RESEARCH_JSON="$f"; break; fi
done
```

If `RESEARCH_JSON` exists and a rendered section has bad prose, examples, or
flag references, fix the corresponding field in that file first. For novel
features, dogfood verifies `research.json::novel_features[]`, writes the
surviving set to `research.json::novel_features_built[]`, and syncs README
`## Unique Features`, SKILL `## Unique Capabilities`, `.printing-press.json`
`novel_features`, and root help Highlights from that verified set.

#### Required sections (must be present and correct)

1. **Title**: "# <Product Name> CLI", use the product's real name with
   correct casing/punctuation (e.g., "Cal.com" not "Cal Com")
2. **Subtitle**: one sentence describing what the CLI does for the user,
   matching the root `Short` field. NOT a description of the API.
3. **Install**: correct install command. Use the printing-press-library
   repo URL, not a per-CLI repo that doesn't exist.
4. **Authentication**: how to set `<API>_API_KEY` env var, where to get
   a key (link to the provider's settings page), self-hosted URL override
   if supported. Read `config.go` to find all env vars.
5. **Quick Start**: 3-5 commands someone will actually run first. Pick
   commands that are both **most useful** (what you'd run daily) and
   **show the CLI's value** (why install this over curl). Usually:
   `doctor` → `sync` → transcendence command (`today`, `health`) →
   `search`. Avoid raw list commands, they dump data without
   demonstrating why the CLI exists.
6. **Commands**: categorized table. Group by domain function (Scheduling,
   Analytics, Account, Utilities), not by implementation structure.
7. **Output Formats**: show `--json`, `--select`, `--csv`, `--compact`,
   `--dry-run`, `--agent`. Use a real command, not a placeholder.
8. **Agent Usage**: agent-native properties and exit codes.
9. **Cookbook**: 8-15 recipes using **verified flag names** from `--help`.
   Show the CLI's unique capabilities: transcendence commands, filters,
   SQL queries, pipes. Include at least one mutation example.
10. **Health Check**: show actual `doctor` output, not a placeholder.
11. **Configuration**: list ALL env vars from config.go with descriptions.
    Include config file path.
12. **Troubleshooting**: common errors mapped to exit codes with fixes.

#### Optional sections (add at your discretion)

- **Rate Limits**: if the API has documented limits
- **Self-Hosting**: if the CLI supports `--api-url` or `BASE_URL` override
- **Pagination**: if the API has notable pagination behavior
- **Sources & Inspiration**: credits to community projects (generated by
  the machine, preserve if present)

