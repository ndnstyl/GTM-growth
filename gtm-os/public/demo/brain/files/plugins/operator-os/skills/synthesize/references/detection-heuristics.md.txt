## Detection heuristics

### Recurring theme detection

For text claims: count occurrences of meaningful 2-3-word phrases across the source set (excluding stopwords). Surface phrases that appear in 3+ sources.

Example: if "interlayer adhesion" appears in 5 sales call transcripts, that's a recurring concern customers raise. Candidate for a chemistry page or rebuttal entry.

### Contradiction detection

For numeric claims tagged by the same metric:
- Pull (metric, value, source-page, source-date) tuples
- Cluster by metric
- Flag clusters where max value > 1.5× min value
- Surface as contradiction for the operator to adjudicate

Example: page A says "$733/install marketing cost" sourced from a verbal estimate on Day 1. Page B says "$1,158/install" sourced from CFO data Week 2. Contradiction, likely the verbal estimate was wrong; CFO data wins. The operator adjudicates.

### Missing entity detection

For proper-noun phrases (CapitalizedWords or "City, ST" or "$X.XM") appearing in 3+ pages without their own entity page:
- Surface as missing-entity candidate
- Propose page name + skeleton

### Metric drift detection

For metrics with timestamped values across multiple sources (e.g., monthly Meta CPL pulls):
- Compute trend direction over last 90 days
- Flag if change > 25% from baseline
- Surface for the operator's investigation


- Surface as potential concept-page candidate
- The pages are saying similar things in different language
