# Step 2: Resolve CLI Directories

For each CLI identifier, resolve it to a directory path:

### If the token contains `/` or `.`
Treat it as a path (absolute or relative). Verify the directory exists.

### If the token is a plain name
Try these locations in order:
1. `$PRESS_LIBRARY/<name>/`, exact match
2. `$PRESS_LIBRARY/<name>-pp-cli/`, with -pp-cli suffix
3. If neither exists, Glob `$PRESS_LIBRARY/<name>-pp-cli*`
4. If exactly one glob match exists and is a directory, use it
5. If multiple glob matches exist, present a numbered menu using AskUserQuestion

If neither exists, scan current-run and archived state:
6. Use Glob to find `$PRESS_RUNSTATE/runs/*/state.json` files
7. Read each, look for an `output_dir` or `working_dir` value whose basename contains the name
8. If found and the directory exists, use it

If nothing resolves, report the error: "Could not find CLI '<name>'. Provide a path or check the name."

### Rescore Current (0 tokens)
1. Use Glob to find all `$PRESS_CURRENT/*.json` files
2. Read each to get `api_name`, `state_path`, and `working_dir`
3. Filter to those whose `working_dir` actually exists on disk
4. If none are found, Glob `$PRESS_LIBRARY/*-pp-cli*` and use those directories instead
5. If exactly one → use it automatically
6. If multiple → present a numbered menu using AskUserQuestion:
   ```
   Multiple CLIs found. Which one to score?
   1. stripe-pp-cli ($PRESS_LIBRARY/stripe-pp-cli)
   2. notion-pp-cli ($PRESS_LIBRARY/notion-pp-cli)
   3. linear-pp-cli ($PRESS_LIBRARY/linear-pp-cli)
   ```
7. If none found → report: "No generated CLIs found. Provide a name or path."
