## Phase C, Recency recommendation

Pull `researched_at` from the most-recent prior `research.json` and
`printing_press_version` + `generated_at` from `.printing-press.json`:

```bash
RESEARCHED_AT=$(jq -r '.researched_at // empty' "$MAN_RESEARCH" 2>/dev/null)
PRESS_VERSION=$(jq -r '.printing_press_version // empty' "$LIB_TARGET/.printing-press.json" 2>/dev/null)
GENERATED_AT=$(jq -r '.generated_at // empty' "$LIB_TARGET/.printing-press.json" 2>/dev/null)
```

Compute the calendar age of the research with `python3` so it stays portable
across macOS/Linux and tolerates the microsecond precision that
`generated_at` carries (BSD `date -f` rejects fractional seconds; `python3`
is on every supported platform):

```bash
AGE_DAYS=$(python3 -c "
from datetime import datetime, timezone
ts = '$RESEARCHED_AT'.replace('Z', '+00:00')
print(int((datetime.now(timezone.utc) - datetime.fromisoformat(ts)).total_seconds() // 86400))
" 2>/dev/null)
```

Surface both signals to the user, research age and prior machine version.
Age thresholds are rules of thumb, not gates:

- under 30 days → reuse looks safe
- 30 to 120 days → reuse plausible; the user should mention any known API
  churn in their reprint reason so the subagent's Pass 2 picks it up
- over 120 days → redo recommended

Don't predict API churn from age alone, describe the signals and let the
user override. The Phase 0 binary-version-bump revalidation in
`/printing-press` handles the machine-delta side independently; don't
duplicate it here.

Ask via `AskUserQuestion`:

1. **Reuse prior research**, keep the prior brief; the subagent re-scores
   prior novel features against current personas
2. **Redo research**, re-run Phase 1 from scratch; the subagent still
   ingests prior novel features as Pass 2(d) input
3. **Show me first**, display the prior brief's headline + novel-features
   list, then re-ask between options 1 and 2
