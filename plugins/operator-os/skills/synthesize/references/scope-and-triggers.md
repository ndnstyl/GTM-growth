## When to invoke

Trigger when:
- The operator says `/synthesize` or `/synthesize last month` or `/synthesize campaigns`
- Monthly cadence (paired with `/lint full`)
- After 5+ substantive ingests since last synthesis
- Before a major decision (budget allocation, hire, strategy pivot) where pattern recognition matters
- When the operator asks "what patterns are emerging across X?"

## The pattern (recursive learning loop)

This implements the recursive learning loop that makes the LLM Wiki compounding:

```
Sources accumulate → /ingest writes summary pages →
  pages link to entities + concepts →
    /synthesize detects patterns across the linked pages →
      patterns crystallize into new concept pages →
        future ingests reference + sharpen concept pages →
          patterns become defensible operating knowledge
```

Without `/synthesize`, the wiki holds individual sources but never surfaces what they collectively reveal. Karpathy's gist mentions this as the "lint" operation; we split it: `/lint` for vault hygiene, `/synthesize` for pattern detection.

## Scope arguments

| Invocation | Scope |
|---|---|
| `/synthesize` | Default: last 30 days, all source pages |
| `/synthesize last 7 days` | Recent week only |
| `/synthesize campaigns` | Pages tagged or named with `campaign` |
| `/synthesize wiki/concepts/funnel*` | Specific concept cluster |
| `/synthesize person_lee_brown` | All sources that touch a specific entity |
| `/synthesize raw/` | Sources only (skip wiki summaries) |
