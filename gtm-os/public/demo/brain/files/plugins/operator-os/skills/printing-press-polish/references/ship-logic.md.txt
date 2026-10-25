# Ship Logic

> **STANDALONE_MODE** reminder: true only for slash-command invocations or an explicit `--standalone` Skill-tool call; false for mid-pipeline polish. The publish-validate gate below applies only when `STANDALONE_MODE=true`, mid-pipeline polish never reaches `hold` on account of it.

## Ship logic

Compute the ship recommendation:

- **`ship`**: verify >= 80%, scorecard >= 75, no critical failures, **AND** verify-skill exits 0 (no SKILL/CLI mismatches), **AND** workflow-verify is not `workflow-fail`, **AND** (when `STANDALONE_MODE=true`) publish-validate reports `passed: true`, **AND** gosec has zero unresolved findings in hand-authored novel-feature Go, **AND** tools-audit shows zero pending findings (every finding fixed or explicitly accepted with rationale), **AND** pii-audit shows zero pending findings and zero gate failures (every PII finding fixed in source or accepted with valid pre-decision fields). The SKILL/workflow/publish/gosec/PII gates are hard requirements: a CLI that ships with a SKILL that lies about it (verify-skill findings) gives agents broken instructions; a CLI whose primary workflow fails verification has not actually shipped; a CLI that publish-validate rejects is not publishable; a CLI with unresolved security static-analysis findings in hand-authored novel-feature code is still reviewer bait; a CLI that fails pii-audit at promote/publish gates will halt shipping anyway. The publish-validate gate applies only when polish ran it (standalone mode); mid-pipeline polish defers publish-readiness to the main SKILL's Phase 6.
- **`ship-with-gaps`**: verify >= 65%, scorecard >= 65, non-critical gaps remain, **AND** the SKILL/workflow/gosec/PII gates above are satisfied, **AND** (when `STANDALONE_MODE=true`) the publish-validate gate is satisfied, **AND** the README has a `## Known Gaps` block that lists the user-facing gaps. Reserved for the rare case where a refactor or external-dependency blocker prevents a clean fix.

  **README Known Gaps is mandatory for ship-with-gaps.** The published library copy is what downstream users see; if the verdict claims gaps exist but the README hides them, downstream users meet a CLI that misbehaves with no disclosure. Before emitting `ship_recommendation: ship-with-gaps`:

  1. Read the CLI's `README.md`. If a `## Known Gaps` section already exists (e.g., the main SKILL Phase 4 wrote it before polish ran), confirm it covers the user-facing items in `remaining_issues`. Add bullets for any newly surfaced user-facing gap polish discovered.
  2. If `## Known Gaps` is missing, write it, placed after `## Quick Start` (or before `## Usage`) to mirror the `## Unique Features` placement convention. One bullet per user-facing item from `remaining_issues`. Phrase from the user's perspective: what command misbehaves, what the workaround is. Example:

     ```markdown
     ## Known Gaps

     - **`analytics export --csv`** returns truncated rows on workspaces with >10k events. Use `--json` and pipe to `jq` as a workaround until the underlying export endpoint is paginated.
     ```

  3. Filter `remaining_issues` for user-facing entries when populating the section. Internal items (verify drift on a deprecated flag, MCP description tuning, polish-internal notes) do not belong in the public Known Gaps. If the agent cannot identify any user-facing gap from `remaining_issues`, the verdict is `ship`, not `ship-with-gaps`.
  4. List each Known Gaps write/update in `fixes_applied` so the caller can surface that this happened.

  If polish cannot responsibly populate Known Gaps from the available evidence (e.g., `remaining_issues` is all internal jargon with no user-facing reading), downgrade the verdict to `hold` rather than ship without disclosure.
- **`hold`**: verify < 65% or scorecard < 65 or critical failures, **OR** verify-skill has unresolved findings, **OR** workflow-verify reports `workflow-fail` and the workflow is the CLI's primary value, **OR** (when `STANDALONE_MODE=true`) publish-validate reports `passed: false`, **OR** gosec still reports unresolved findings in hand-authored novel-feature Go, **OR** pii-audit still has pending findings or gate failures, **OR** the Phase 3 gate bundle says this is a prior sub-60 reprint with missing transcendence rows and no accepted `partial_transcendence_override`. Mid-pipeline polish never reaches `hold` because of publish-validate, the check doesn't run in that mode and `publish_validate_*` is emitted as `skipped (mid-pipeline)`.

### Push higher without gaming

The ship gates are a floor, not a ceiling. After they pass, look at scorecard dimensions still below max and ask whether each gap is real or structural:

1. **Find the underlying deficit, not the score.** The scorecard is a proxy for quality, not the goal itself. A README scoring 8/10 might be missing a Cookbook section or have outdated commands, that's a real, fixable gap. A `mcp_surface_strategy` scoring 2/10 on a 200-endpoint API might be flagging that the surface is mostly endpoint mirrors, also potentially fixable.
2. **If there's a real, agent-grade improvement available, make it.** Better description, missing flag doc, weak README section, an example that doesn't reflect actual usage. The CLI gets better and the score follows.
3. **If the deficit is structural, document and accept.** Some dimensions assume capabilities the CLI's domain doesn't have (a read-only API scored against write-workflow dimensions, a CLI with no auth scored on auth dimensions, a small API penalized on `surface_strategy` thresholds calibrated for large APIs). Note the reason in `skipped_findings` and move on.
4. **Never add scaffolding to satisfy the scorer.** Fake commands, fake tests, fake flags, or boilerplate prose written purely to nudge a number, those degrade the CLI to satisfy the proxy. The scorer is imperfect by design (the "scoring may be imperfect" caveat in AGENTS.md applies). Trust the underlying judgment, not the number.

#### MCP scorecard dims map to spec fields, not generator code

When `mcp_token_efficiency`, `mcp_tool_design`, `mcp_remote_transport`, or `mcp_surface_strategy` are below max, the fix is almost always a spec edit + regenerate (or `regen-merge` from a freshly-generated tree), **not** a generator-template change. Polish CAN address these, do not classify them as "feature add to a generator-owned file, retro candidate."

| Weak dim | Spec field that fixes it | What to add to `spec.yaml`'s `mcp:` block |
|---|---|---|
| `mcp_remote_transport` | `mcp.transport` | `transport: [stdio, http]` (small APIs at or under `spec.DefaultRemoteTransportEndpointThreshold` typed endpoints already get this by default; the override is only needed when the spec opted into a narrower list or the API is above the threshold and still wants remote reach) |
| `mcp_token_efficiency`, `mcp_surface_strategy` | `mcp.endpoint_tools`, `mcp.orchestration` | `endpoint_tools: hidden` + `orchestration: code` (Cloudflare pattern: ~70 raw endpoint tools collapse to `<api>_search` + `<api>_execute`; all endpoints still reachable via execute) |
| `mcp_tool_design` | `mcp.intents` | Define multi-step intent compositions for the workflows the API supports |
| `mcp_description_quality` | `mcp-descriptions.json` (override file at the CLI root) | Per-tool description overrides; thin spec-derived descriptions get richer text without spec edits |

Recommended threshold: at >50 typed endpoints, default to recommending all four (`transport`, `endpoint_tools=hidden`, `orchestration=code`, `intents` for the headline workflows). Small APIs (<= `spec.DefaultRemoteTransportEndpointThreshold`) get the http transport by default already, so `mcp_remote_transport` lands at 10/10 without any spec edit, only call it out if the spec explicitly narrowed the list. The full reference is `docs/SPEC-EXTENSIONS.md`.

After editing the spec, regenerate (or `regen-merge` the changes into the published library) so the new `mcp:` block reaches templates. Cobratree-walked novel commands continue to surface as MCP tools either way; they don't need spec changes.

Rule of thumb: if your fix would still be valuable if the scorecard didn't exist, do it. If the only motivation is "to push the score," don't.

