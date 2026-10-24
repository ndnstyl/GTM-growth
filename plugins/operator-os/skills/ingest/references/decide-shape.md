# Decide the shape, then keep going

Work out, and carry into the report at Step 8:
- 3-5 key takeaways
- The source-page title and slug
- Which existing entity/concept pages this touches
- Any NEW entity/concept pages this source justifies creating
- Anything the source leaves genuinely unsettled

**Do not stop here for approval.** Ingest, then report (see rules/execute-now.md). The operator's
review surface is the Step 8 report and `/lint`, not a gate mid-run. They can order a revert; they
should not have to authorize a write. (Karpathy's "I prefer to ingest sources one at a time and stay
involved" is a one-source-at-a-time rule, not an approval rule; staying involved is what the report is for.)

**Two things still stop the run**, because they are correctness gates rather than approval gates:

1. **Unreliable attribution.** If the source's speaker or author labels cannot be trusted, still ingest, but record the map as dated inference with its proof lines, mark every person-attributed
   claim provisional, and lead the report with the defect. Never write an attributed quote
   you cannot substantiate from the source itself.
2. **A contradiction with an existing note** that is not clearly sequential self-correction.
   Flag it in the report for the operator to adjudicate; do not silently overwrite
   (see Step 5 and).

   **Source-precedence order** (echoes the primary/secondary/vendor tiering already
   used in the marketing corpus, per MEMORY.md): rank every source `[primary]`
   (first-party, ground-truth: The operator, the CRM, platform APIs), `[secondary]`
   (derived/reported-on-primary: internal analysis, session notes), or `[vendor]`
   (an outside party's own account of its own performance). A lower tier never
   overrides a higher one when integrating claims into an existing page.

   **Hard stop, not a silent resolve:** if two sources both tiered `[primary]`
   genuinely conflict on the same claim, do not pick a side and do not average
   them. Stop, write both claims into the page as an explicit unresolved
   conflict (cite both sources), and lead the Step 8 report with it for the operator to
   adjudicate. This is stricter than the general contradiction flag above, a
   primary-vs-primary conflict blocks silent resolution entirely, it does not
   just get noted in passing. (This is a separate concern from the dedup check
   in `write-summary.md`, which is about duplicate *sources*, not conflicting
   *claims*.)
