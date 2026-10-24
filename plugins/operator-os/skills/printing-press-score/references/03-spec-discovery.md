# Step 3: Find Spec for Tier 2 Scoring

For each resolved CLI directory, find the OpenAPI spec:

1. Check `<cli-dir>/spec.json`, the pipeline converts YAML specs to JSON during generation
2. If not found, scan `$PRESS_RUNSTATE/runs/*/state.json` files for one matching this CLI's directory. Read its `spec_path` field. If that file exists on disk, use it.
3. If no spec found, **proceed without `--spec`**. Note to the user: "No spec found, spec-derived dimensions will be marked N/A and omitted from the denominator. Provide a spec path for full scoring."
