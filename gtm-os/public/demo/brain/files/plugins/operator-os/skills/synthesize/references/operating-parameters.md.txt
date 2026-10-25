## Cadence + cost notes

- Don't run daily, monthly cadence is right
- Budget ~30K tokens per run + ~$0.30 in Cohere embedding costs at moderate vault size
- After 6+ months of accumulation, may need to scope tighter (e.g., `/synthesize last 30 days` instead of full vault)

## Outputs are CANDIDATES, not commits

For Layer 2 minimal-in-loop maturity (per `feedback_minimal_human_in_loop_target.md`), `/synthesize` is one of the last places to remove human in the loop. Pattern detection is a learnable AI task, but pattern INTERPRETATION (does this matter? is this acting on the right signal?) is where human judgment compounds longest.

## Constraints

- READ-only against `raw/` (immutable per `_WIKI-SCHEMA.md`)
- NEVER auto-merge, rewrite, or delete pages without the operator approval (a merge deletes a page)
- Create concept pages and append to existing ones directly; report, do not ask
  (amended 2026-08-24, the old "WAIT on every concept-page creation" line contradicted and)
- Surface confidence levels, don't present a low-evidence pattern as high-evidence

## Anti-patterns

- Running `/synthesize` after every single ingest (over-eager; signal washes out)
- Auto-creating concept pages from low-evidence patterns (vault dilutes to noise)
- Skipping the contradiction-adjudication step (drift goes unflagged)
- Presenting patterns without confidence rating (the operator can't prioritize)
- Conflating recurring-theme detection with strategy advice (synthesize SURFACES, doesn't DECIDE)
