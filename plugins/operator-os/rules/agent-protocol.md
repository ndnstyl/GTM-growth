# Agent Protocol

How sessions, subagents and the main loop work together. Copy this file into your project's rules folder and edit the bracketed parts.

## Startup (before any work)

1. Confirm the constitution is in context (a SessionStart hook loads it; read it only if missing, for example in a subagent).
2. Recall relevant notes from the vault (index first, then wikilinks) for the task domain.
3. Identify which project this work belongs to.
4. Load an observation skill once per session for task-oriented work, and hold the observation mindset for the whole session.

## Delegation conventions (every subagent call)

Every subagent prompt starts with a task-type tag, `[task_type=X]`, where X comes from a closed list your project defines. Example values: `n8n_workflow_build`, `data_pipeline_build`, `data_engineering_review`, `paid_media_ops`, `marketing_analysis`, `react_component_create`, `ts_bug_fix`, `ui_ux_design`, `sql_query`, `git_commit`, `git_deploy`, `code_review`, `security_audit`, `content_research`, `content_write`, `meta`.

If no value fits, propose a new one in review. Do not invent strings: a closed list is what makes routing and cost reporting possible.

## Specialist seats

A seat is an agent definition with a lane, a model tier, and a stated way its work is evaluated. Lane law:

- The junior builds. The senior adversarially reviews and gates the work: PASS, PASS-WITH-CONDITIONS, or BLOCK.
- The media operator stages changes and never pushes to a live ad platform.
- The analyst reads decision views only.
- A specialist takes precedence over the generalist agents (implementer, reviewer, researcher) inside its own lane; generalists cover everything outside.

Each seat is agent-first: a human hired into the seat later inherits the definition and its receipts as onboarding. When you create a seat, state how its work will be evaluated (a review gate, a metric, or a seat that reviews it). An un-evaluable seat is un-auditable by construction.

Score researcher delegations in your synthesis with a one-line reason; researchers are not auto-scored.

**Vault writes are main-loop-only.** Subagents research, draft and return content; they never write to the vault. The main loop reviews the draft and applies it, so concurrent agents cannot race the vault and every vault change passes one pair of eyes.

## Supervising delegated work (hard rule)

Every delegation and every background task is a long task. The five-minute supervisor in the loud-failure rule binds the delegator, not only the agent:

1. **State the budget in the delegation**: expected deliverable, expected duration, and the token ceiling past which the agent stops and reports.
2. **Probe at five minutes and every five minutes after.** Read the machine, not the agent's report: files changed, tests run, processes alive, receipt counters moving. An agent's silence is not progress and its "still working" is not evidence.
3. **Run the decision tree** from the loud-failure rule. Tokens spent with no files changed and no units completed is SPINNING: stop it and report, however confident its last message sounded.
4. **Never wait on a notification as the only signal.** A notification that never arrives looks identical to a task that is working.
5. **Report the probe, not the promise.** Status names what was measured on the machine and when.

## Small-task fast lane

"No spec kit, no work" stands for anything non-trivial. For a genuinely small task (a one-file typo, a config value flip, a copy edit with no downstream wiring) a full kit is disproportionate:

- Log it as a one-line queue entry: what, why, done-when.
- **Escalation trigger:** if the task touches a second system, needs a design decision, or takes more than one sitting, stop and open a real spec kit. Do not justify scope creep inside the queue entry.
- This never applies to anything touching outreach to people, credentials, schema, or governed data. Those gate on their own rules regardless of size.

## Context-usage self-check

Piggyback a context-usage check on the task-observer checkpoint cadence (about every third completed todo): report healthy, warning or critical so the session gets a heads-up before auto-compaction fires.

## Git

A shared working tree carries other sessions' uncommitted work. No agent runs `git rebase`, `pull`, `checkout`, `restore`, `stash`, `reset`, `clean`, `merge` or `add -A` there. Allowed: `status`, `diff`, `log`, `show`, `add <explicit paths>`, `commit <explicit paths>`. A bare `git commit` ships whatever another session staged. A dirty tree or a conflict is reported, not resolved by rewriting the tree.

## Shutdown (before ending a session)

- Log the session outcome (a Stop hook does this).
- Update the status card for any work touched; the board is the record, append-only and dated.
- Capture learnings in the vault per the learning-capture rule.
- A spec kit that closes adds one line under `[Unreleased]` in the changelog naming the kit and its state, never a commit hash.
