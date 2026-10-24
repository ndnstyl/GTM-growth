# Reproducing any Explore-tab number with the DuckDB CLI

Every number the Pivot builder (`components/reports/Pivot.tsx`) shows is a
plain SQL query over the published parquet files in
`the data folder`. Nothing is computed
client-side beyond the query DuckDB itself runs, and the panel's "SQL"
disclosure shows the exact statement that produced the on-screen table.

## Steps

1. Install the DuckDB CLI (`brew install duckdb` or download from
   duckdb.org) if it is not already on the machine.
2. `cd the data folder`
3. Start the CLI: `duckdb`
4. Recreate the contract views this app builds at load time. For any
   contract table `T`, the physical files are the bare `T.parquet` (if it
   exists) plus every `*__T.parquet` file, unioned `BY NAME`. Example for
   `fact_spend_daily`:

   ```sql
   CREATE VIEW fact_spend_daily AS
   SELECT * FROM read_parquet('google_ads__fact_spend_daily.parquet')
   UNION ALL BY NAME
   SELECT * FROM read_parquet('microsoft_ads_campaign__fact_spend_daily.parquet')
   UNION ALL BY NAME
   SELECT * FROM read_parquet('microsoft_ads_ad__fact_spend_daily.parquet');
   ```

   `lib/reports/sql/_contract_views.ts` (`CONTRACT_TABLES`, `physicalKeysFor`)
   is the source of truth for which physical files map to which contract
   table; check `_manifest.json` in the same directory for the current file
   list, since it changes as more feeds publish.

5. Paste the exact SQL from the panel's "SQL" disclosure and run it. It will
   reference the same view names built above, plus (for the preset that
   joins spend and funnel) `dim_market`, and the generated `dim_date_generated`
   calendar view (`buildHierarchyViews()` in the same file) if the query used
   it.
6. Every dim table (`dim_market.parquet`, `dim_zip.parquet`, etc.) loads the
   same way: `CREATE VIEW dim_market AS SELECT * FROM
   read_parquet('dim_market.parquet');` (or the empty-typed view from
   `CONTRACT_TABLES` if the file does not exist yet).

## Confidence badges

Each pivot row's confidence badge is `MIN` over a rank mapped from the
`confidence` column of the underlying rows in that group (deterministic=4,
mapped=3, provisional=2, unavailable_*=1 or 0). A row whose winning
confidence starts with `unavailable_` renders as "unavailable" in the UI,
never as a bare 0, per the spec's confidence-precedence ruling
(data-contract.md, "Confidence precedence"). To see the raw reason string
instead of the badge, run the same SQL but select `confidence` directly
instead of the `MIN(...)` rank expression.

## Known approximations in this MVP

- `dim_date` is generated in SQL (`generate_series`), not read from
  `dim_date.parquet`, since no producer publishes that file yet.
- The zip -> market join assumes `dim_zip.branch_id = dim_market.market_id`;
  the contract does not name an explicit join key between the two files, so
  treat this hierarchy as best-effort until a producer confirms the key.
- Contract tables with zero matching physical files (see the Shell's console
  log at load, `[reports] contract views: resolved=[...] empty=[...]`) render
  as empty, typed views, never as an error.
