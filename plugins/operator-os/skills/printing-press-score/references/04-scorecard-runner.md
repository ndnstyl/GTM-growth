# Step 4: Run Scorecard

### Single Score Mode

Run the scorecard command:

```bash
cli-printing-press scorecard --dir <resolved-path> --json
```

If a spec was found, add `--spec <spec-path>`.

Parse the JSON output. The structure is:

```json
{
  "api_name": "...",
  "steinberger": {
    "output_modes": 8,
    "auth": 7,
    "error_handling": 6,
    "terminal_ux": 9,
    "readme": 5,
    "doctor": 10,
    "agent_native": 7,
    "local_cache": 4,
    "breadth": 7,
    "vision": 6,
    "workflows": 3,
    "insight": 5,
    "path_validity": 0,
    "auth_protocol": 0,
    "data_pipeline_integrity": 7,
    "sync_correctness": 6,
    "type_fidelity": 4,
    "dead_code": 3,
    "total": 72,
    "percentage": 72
  },
  "overall_grade": "B",
  "gap_report": ["..."],
  "unscored_dimensions": ["path_validity", "auth_protocol"]
}
```

If `unscored_dimensions` is present, those dimensions should be rendered as `N/A`, not `0/x`, and should be described as omitted from the denominator rather than as fixable CLI defects. For backward compatibility, JSON still encodes the numeric fields as `0`; consumers must use `unscored_dimensions` to distinguish `N/A` from a real zero.

Learn-loop credit is static-behavioral, never presence-based: the scorecard credits `teach`/`recall`/`learnings` registration on the root command and non-empty entity lookup seeds (or the spec's recorded no-entities escape). The learn loop is default-on, so `internal/learn/` existing earns nothing; when explaining a learn gap, point at missing seeds or unregistered commands, not missing files. Execution proof (verify matrix, `learnings stats`) belongs to verify and dogfood; the scorecard runs no binaries.

### Compare Mode

Run **both** scorecard commands in **parallel** using two simultaneous Bash tool calls:

```bash
# Call 1:
cli-printing-press scorecard --dir <path1> --spec <spec1> --json

# Call 2:
cli-printing-press scorecard --dir <path2> --spec <spec2> --json
```

Parse both JSON outputs.
