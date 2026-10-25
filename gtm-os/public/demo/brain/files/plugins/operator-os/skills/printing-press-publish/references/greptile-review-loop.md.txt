> Loaded by SKILL.md twice: once before Step 4 (read before opening the PR) and once after Step 8 (drive the PR to stable green). Both pointers route here so the contract is written once.

## Step 3.5: The Greptile review contract, read before opening the PR

Every PR into the public library gets an automated Greptile review plus a `Greptile policy gate` CI job. The canonical contract is the library's [`AGENTS.md → "Automated code review with Greptile"`](https://github.com/mvanhorn/printing-press-library/blob/main/AGENTS.md#automated-code-review-with-greptile); the essentials:

- **The bar is resolving every Greptile finding before merge, the 0-5 score is a confidence signal, not the gate.** A 4/5 with everything resolved is ready; a 5/5 with open P1s is not. Treat every P0 and P1 as blocking; P2s need a fix or a concrete deferral reply.
- **Reviews are incremental**: every push re-triggers a fresh review that can surface new findings. Drive the PR to a *stable* green, never declare done after round one.
- **Read the latest `greptile-apps` top-level summary, not just inline threads.** Summaries can carry actionable `Comments Outside Diff` blocks even when the thread list is empty. Run the repo's review-state helper before declaring ready:
  ```bash
  python3 .github/scripts/pr-review-state/greptile_feedback.py <PR_NUMBER>
  ```
- **Timeout recovery**: if the policy gate fails with `Timed out waiting for Greptile Review to complete` (large new-CLI diffs are the common trigger), the gate auto-posts `@greptileai review` after ~3 minutes; if that doesn't recover, post `@greptileai review` yourself and wait.
- **The score gate**: the policy gate requires the latest Greptile comment on the current head SHA to carry `Confidence Score: ≥ 4/5`. A new push re-runs it, keep the score meeting threshold on the final head.

## After the PR opens

Once the PR is open, it enters the public library repo's review contract. That contract is owned by [`mvanhorn/printing-press-library` AGENTS.md → "Automated code review with Greptile"](https://github.com/mvanhorn/printing-press-library/blob/main/AGENTS.md#automated-code-review-with-greptile); read it for the canonical version. An agent invoking this skill from `cli-printing-press` will not have loaded the library's AGENTS.md, so the obligations are summarized here.

Greptile reviews **incrementally**: every commit you push re-triggers a fresh review, which can surface new findings the previous round didn't. This is a loop, not a single pass, drive the PR to a *stable* green and don't declare done after round one.

### Drive the PR to stable green

Iterate until **all** of these hold, confirmed by the review that your most recent fix commit triggered:

- **All Greptile findings resolved.** The 0-5 score is a confidence signal, not the gate, the bar is resolving every finding. 4/5 with everything resolved is ready; 5/5 with open P1s is not. For each P0/P1/P2 thread, either push a fix or reply with a concrete reason it shouldn't fire, not "won't fix", but *why* the code is right as written or *why* deferral is justified. The policy gate also requires the latest score on the current head SHA to be ≥ 4/5, so keep the final head meeting that threshold.
- **All CI checks pass.** `verify-library-conventions`, `Govulncheck`, and any other workflow on the PR.

Read findings from two surfaces, they don't overlap:

- `gh pr view <PR> --repo <owner>/<repo> --comments` returns the top-level issue conversation (Greptile's summary comment, score, CI bots).
- `gh api repos/<owner>/<repo>/pulls/<PR>/comments` returns the inline diff-anchored review comments, Greptile posts each P0/P1/P2 finding here, **and these are NOT included in `--comments`**. Skipping this call is how an agent silently declares "all findings resolved" while every inline thread is still open.

**Monitoring is the harness's job, not a busy-loop you hand-roll.** Use whatever PR-activity monitoring your environment provides, react to review/CI events as they arrive, or re-check on an interval if it doesn't push events. After each fix push, wait for the re-triggered review to land before judging done; a new round can reopen the gate.

**Don't hand-edit `registry.json` or `cli-skills/pp-<api-slug>/SKILL.md` to satisfy a finding**, both are bot-regenerated post-merge by `[skip ci]` commits, and the library's `Fail on changes to generated artifacts` check pre-rejects any PR that touches them.

### Terminal state, then hand back

Once the PR is stably green, the skill's job is done. **Do not merge it and do not poll waiting for it to merge**, merges into the public library are the maintainer's manual review, not this skill's and (for a fork contributor) not the user's either.

Read `access` from `$PUBLISH_CONFIG` (`jq -r .access "$PUBLISH_CONFIG"`) to determine what to do next:

- **If `access` is `push`** (maintainer/admin with push access): apply the `awaiting-maintainer` label to signal the PR is ready for manual review:
  ```bash
  gh pr edit <PR> --repo mvanhorn/printing-press-library --add-label awaiting-maintainer
  ```
- **If `access` is `fork`** (community contributor): you cannot merge or label the upstream PR. There is nothing more to do once it's green.

Then **report the terminal state and return control to the caller.** Do not offer a retro or any follow-up menu from this skill by default, that decision belongs to whoever invoked publish. The `printing-press` pipeline offers retro as its own post-publish tail; a direct human invocation without `--from-polish` just ends here.

If `POLISH_HANDOFF=true`, offer retro as a soft tail after the PR is green. This preserves the standalone polish -> publish workflow without allowing polish's same-turn `AskUserQuestion` answer to create or update a public-library PR.

Present via `AskUserQuestion`:

> "PR opened: <PR_URL>. Run a retro? It surfaces systemic gaps from this session (generator misses, scorer bugs, skill-doc drift) as a GitHub issue for the Printing Press maintainers. Every retro filed raises the floor for the next CLI, and your session context is freshest right now."
>
> 1. **No, I'm done** (default)
> 2. **Yes, run retro now**

If the user picks yes, invoke `/printing-press-retro`.
