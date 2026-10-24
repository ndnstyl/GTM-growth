# Feed wiring

1. **Land the data as structured rows in the warehouse** and define the compute once as a view. Never sum a file to a headline figure.
2. **Export through the governed lane** to a Parquet file with an enumerated column allowlist for the tier the reports app may see.
3. **Register the feed explicitly in code** (a feeds list the app imports). Do not write it into a generated `_manifest.json`: whatever builds that manifest will regenerate it and drop your entry without an error.
4. **Add a source entry** to the workbench registry: its key, its dimensions, its measures, which dimensions each measure may be broken out by (the grain law), and which measures are gated on a platform being present.
5. **Test parity**: the number a view shows equals the number the warehouse view returns for the same filter, to the cent.
6. **Deploy with the test suite on the path.** The deploy script refuses on any failure, and the shipped-views test validates every saved view against the live registry.

Honesty markers (provisional, withheld-with-reason, platform absent) are columns in the feed, so they cannot be dropped on the way to the screen.
