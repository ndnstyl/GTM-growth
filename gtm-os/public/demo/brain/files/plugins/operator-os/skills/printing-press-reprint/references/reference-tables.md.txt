# Reference tables

Lookup tables referenced from the phase files. Kept here as a single
scannable index; the phase files remain the source of truth for when each
table applies.

## Presence/reconciliation matrix (Phase A)

| Local | Public registry | Action |
|-------|-----------------|--------|
| absent | absent | STOP, nothing to reprint; suggest `/printing-press <api>` for a fresh print |
| absent | present | invoke `/printing-press-import <api>`, then continue |
| present | absent | continue, never-published local CLI; skip import |
| present, same `run_id` | present | continue without import |
| present, public newer `generated_at` | present | offer import via `AskUserQuestion`; user decides |
| present, local newer `generated_at` | present | STOP, local has unpublished work; tell user to publish or discard first |

See `references/phase-a-presence-reconciliation.md` for full context.

## Recency thresholds (Phase C)

- under 30 days → reuse looks safe
- 30 to 120 days → reuse plausible; the user should mention any known API
  churn in their reprint reason so the subagent's Pass 2 picks it up
- over 120 days → redo recommended

Age thresholds are rules of thumb, not gates. See
`references/phase-c-recency.md` for the calculation and framing.

## Scorecard enrichment dimensions (Phase D)

| Dimension | Threshold | Enrichment section |
|-----------|-----------|---------------------|
| `mcp_remote_transport` | below 10 | `/printing-press` Phase 2 **Pre-Generation MCP Enrichment** |
| `mcp_token_efficiency` | below 10 | `/printing-press` Phase 2 **Pre-Generation MCP Enrichment** |
| `mcp_tool_design` | below 10 | `/printing-press` Phase 2 **Pre-Generation MCP Enrichment** |
| `mcp_surface_strategy` | below 10 | `/printing-press` Phase 2 **Pre-Generation MCP Enrichment** |
| `auth_protocol` | below 10, or slug-derived env var where a canonical one exists | `/printing-press` Phase 2 **Pre-Generation Auth Enrichment** |
| `data_pipeline_integrity` | below 10, only when sync-eligible resources exist | `/printing-press` Phase 2 sync/cache enrichment decision |

Note (brittleness flag, not changed): these four field names
(`mcp_remote_transport`, `mcp_token_efficiency`, `mcp_tool_design`,
`mcp_surface_strategy`, `auth_protocol`, `data_pipeline_integrity`) are
hardcoded to the current scorecard schema. If the scorecard schema renames
or restructures these fields, Phase D's enrichment-opportunity detection
silently stops firing rather than erroring. See `references/phase-d-handoff.md`
for full detail.

## Patch-count scale guidance (Phase D)

| Patch count | Shape |
|-------------|-------|
| 1 to 3 | one short paragraph per patch, substance first, then how it manifested |
| 4 to 9 | one tight sentence per patch, same substance-first shape |
| 10+ | thematic summary by category (auth, pagination, query encoding, MCP additions, helpers, classifiers, error envelopes), citing 2 to 3 patch `id`s per theme as evidence |

See `references/phase-d-handoff.md` for the full patch-summary framing and
the worked example.
