# Step 5: Render Output

### Single Score Table

Render a rich markdown table. Note: Tier 1 dimensions are all /10. Tier 2 dimensions are /10 except TypeFidelity and DeadCode which are /5.

```
Scorecard: <api_name>

Infrastructure (Tier 1)
| Dimension      | Score |
|----------------|-------|
| Output Modes   | 8/10  |
| Auth           | 7/10  |
| Error Handling | 6/10  |
| Terminal UX    | 9/10  |
| README         | 5/10  |
| Doctor         | 10/10 |
| Agent Native   | 7/10  |
| Local Cache    | 4/10  |
| Breadth        | 7/10  |
| Vision         | 6/10  |
| Workflows      | 3/10  |
| Insight        | 5/10  |

Domain Correctness (Tier 2)
| Dimension               | Score |
|--------------------------|-------|
| Path Validity            | 9/10  |
| Auth Protocol            | 8/10  |
| Data Pipeline Integrity  | 7/10  |
| Sync Correctness         | 6/10  |
| Type Fidelity            | 4/5   |
| Dead Code                | 3/5   |

**Total: 72/100, Grade B**
```

If `gap_report` is non-empty, list the gaps:

```
Gaps:
- <gap 1>
- <gap 2>
```

If `unscored_dimensions` is non-empty, add a note after the table:

```
Note: path_validity, auth_protocol were unscored and omitted from the denominator. Provide a spec path for full scoring.
```

### Compare Table

Render a side-by-side table with a delta column. Show the first CLI name and second CLI name as column headers. Calculate delta as (CLI 1 score - CLI 2 score). Show `+N` for positive, `-N` for negative, `, ` for zero.

```
Scorecard Comparison: <name1> vs <name2>

Infrastructure (Tier 1)
| Dimension      | <name1> | <name2> | Delta |
|----------------|---------|---------|-------|
| Output Modes   | 8/10    | 5/10    | +3    |
| Auth           | 7/10    | 7/10    |, |
| ...            |         |         |       |

Domain Correctness (Tier 2)
| Dimension               | <name1> | <name2> | Delta |
|--------------------------|---------|---------|-------|
| Path Validity            | 9/10    | 6/10    | +3    |
| ...                      |         |         |       |

| **Total**  | **72/100 (B)** | **56/100 (C)** | **+16** |
```
