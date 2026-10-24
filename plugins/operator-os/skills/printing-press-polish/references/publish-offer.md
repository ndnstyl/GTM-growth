# Publish Offer

> **STANDALONE_MODE** reminder: this whole section is skipped unless `STANDALONE_MODE` is true (slash-command invocation, or a Skill-tool call with explicit `--standalone`). Mid-pipeline polish (`STANDALONE_MODE=false`) returns before this point, the parent skill owns publish.

## Publish Offer

**Skip this entire section unless `STANDALONE_MODE` is true.** `STANDALONE_MODE` is set in `references/resolve-cli.md`'s "Resolve CLI" step, based on the caller mode: true for slash-command invocations (`/printing-press-polish ...`) or Skill-tool invocations that pass `--standalone` in `args`; false otherwise. When false, polish is being called from main SKILL Phase 5.5 or hold-path "Polish to retry," and the working CLI has not been promoted to library yet. `/printing-press-publish <slug>` would resolve to `$PRESS_LIBRARY/<slug>/`, which is either empty or holds a stale prior run, invoking publish here would either fail to resolve or ship the wrong copy. The parent skill owns the publish flow on that path; just emit the result block and return.

Apply the publish turn-boundary rule: the `AskUserQuestion` answer may authorize only a handoff message, not a same-turn publish. Publishing opens or updates a public-library PR, so it requires a fresh user-authored message after polish completes. See `references/publish-turn-boundary.md` for rationale.

A simple check:

```bash
if [ "$STANDALONE_MODE" != "true" ]; then
  echo "non-standalone caller; skipping Publish Offer"
  return
fi
```

The gate is the caller-mode flag, **not** the resolved path. A Skill-tool invocation without `--standalone` defers publish even when the path lives under `$PRESS_LIBRARY/<slug>/`; this is the safer default, and the only way the inverted Phase 5.5/5.6 failure mode (mid-pipeline run firing a public fork + PR) gets caught at the polish boundary. The previous path-substring heuristic (`*.runstate/*`) is no longer load-bearing here, it has been retained in `references/research-dir-resolution.md` because that block is selecting between two real on-disk layouts, which is a different concern from publish gating.

For standalone invocations, continue with the offer below.

If `ship` or `ship-with-gaps`:

Construct the prompt from the result block. The shape is data-driven so the user is never asked to weigh "Polish again" against "Publish" when polish itself just decided another pass would not help.

### Recommendation

Pick the recommended action from the polish result:

- `ship` + `remaining_issues` empty → recommend **Publish**.
- `ship` + `remaining_issues` non-empty + `further_polish_recommended: yes` → recommend **Polish again**.
- `ship` + `remaining_issues` non-empty + `further_polish_recommended: no` → recommend **Publish** if the remaining issues do not touch the CLI's headline commands, otherwise surface the trade-off and let the user decide between **Publish** (as-is; README is not auto-updated for `ship` verdicts) and **Done**.
- `ship-with-gaps` + `further_polish_recommended: yes` → recommend **Polish again**.
- `ship-with-gaps` + `further_polish_recommended: no` → recommend **Publish** (the gap is already in README's `## Known Gaps` because polish's ship logic enforces that for `ship-with-gaps`, see `references/ship-logic.md`) or **Done** if the gap is publish-blocking, agent judgment.

### Menu

Suppress the "Polish again" option entirely when `further_polish_recommended: no`. Keep "Publish" and "Done" always available.

Surface `further_polish_reasoning` as context when polish opted out of recommending another pass, the user should see *why* polish is done.

Present via `AskUserQuestion`. Two example shapes:

**Polish converged clean** (`remaining_issues` empty, `further_polish_recommended: no`):

> "<CLI_NAME> polished: scorecard XX/100, verify XX%. Polish ran cleanly, nothing more to fix.
>
> Recommendation: Publish.
>
> 1. **Publish separately** (recommended), show the publish command for the next user message
> 2. **Done for now**, CLI is at $PRESS_LIBRARY/<cli-name>"

**Polish thinks another pass would help** (`remaining_issues` non-empty, `further_polish_recommended: yes`):

> "<CLI_NAME> polished: scorecard XX/100, verify XX%. <N> issues remain.
>
> Polish notes: '<further_polish_reasoning>'
>
> Recommendation: Polish again before publishing.
>
> 1. **Polish again** (recommended), close the remaining <N> issues
> 2. **Publish separately**, show the publish command to ship as-is in the next user message
> 3. **Done for now**, CLI is at $PRESS_LIBRARY/<cli-name>"

The recommended option leads, carries the `(recommended)` label, and the leading `Recommendation:` line states the agent's call explicitly. Three reinforcing channels so the user does not have to infer from ordering.

### If "Publish separately"

Do not invoke `/printing-press-publish <cli-name>` from this same turn, and do not check or create public-library PRs here. Print a handoff that requires an explicit fresh user-authored message. Include the `--from-polish` marker so publish can offer the same post-publish retro tail that polish used to offer after a successful inline publish:

> "Publishing requires a separate user confirmation because it can fork `mvanhorn/printing-press-library`, push a branch, and open or update a PR.
>
> To publish, send this as your next message:
>
> `/printing-press-publish <cli-name> --from-polish`"

After printing the handoff, stop. If the user sends the command in a later message, the publish skill owns validation, packaging, public-library PR creation or update, and the `--from-polish` post-publish retro offer.

(When `STANDALONE_MODE` is false this whole section is unreachable, the Publish Offer guard at the top of this section returns early, so no extra check is needed here.)

### If "Polish again"

Re-run Phase 1 → Phase 2 → Phase 3 with the same CLI. Maximum 2 additional polish passes (3 total including the first).

### If "Done for now"

End normally.

