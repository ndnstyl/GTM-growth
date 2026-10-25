# SKILL Static-Check Fixes (Priority 5.5, verify-skill)

### Priority 5.5: SKILL static-check failures (verify-skill)

Read `/tmp/polish-verify-skill.json` for the full finding list. Each finding has a `check` (`flag-names`, `flag-commands`, `positional-args`, `unknown-command`, or `canonical-sections`), a `command` (the path the SKILL claimed), and a `detail` describing the mismatch. Common shapes and fixes:

- **`flag-names`**, SKILL references `--foo` on a `<cli> ...` invocation but no command in `internal/cli/*.go` declares it. Either the example is wrong (fix the SKILL or remove the recipe) or the flag was deleted (decide if it should come back). **Out of scope:** flags on lines that invoke other tools (e.g. `npx -y @mvanhorn/printing-press install <api> --cli-only`, `gh pr create --base ...`, `go install ...`). The recipe-scoped flag-names check ignores those by design, never strip an external-tool flag to make verify-skill exit 0, and never replace the install instructions with a fabricated slash command. If the finding is firing on an external-tool flag anyway, that is a verify-skill bug, not a SKILL bug; report it instead of editing the SKILL.
- **`flag-commands`**, `--foo is declared elsewhere but not on <cmd>`. The flag exists somewhere but not on the command the SKILL invoked it on. Two fixes:
  1. If the flag is added via a shared helper like `addXxxFlags(cmd, ...)`, inline the `cmd.Flags().StringVar(...)` declaration directly in the affected command's source file. The verify-skill grep cannot follow function-call indirection.
  2. If the SKILL example is genuinely wrong, fix the example to use a flag the command does declare.
- **`positional-args`**, `got N positional args; Use: "<cmd> <arg>" expects M-M`. The SKILL recipe passed N positional args but the command's `Use:` declares M required. Two fixes:
  1. If the command also accepts the value via a `--flag`, change `Use: "cmd <arg>"` to `Use: "cmd [arg]"` (square brackets = optional). Verify-skill correctly accepts `--flag`-only invocations against an optional positional.
  2. If the SKILL example is missing a required positional, fix the example.
- **`canonical-sections`**, `install section drift: hand-edit detected in a generator-owned section`. The `## Prerequisites: Install the CLI` block has been edited away from what the generator would emit for this CLI today. **Do not hand-edit the install section.** It's templated from `internal/generator/templates/skill.md.tmpl` parameterized on `(api_name, category, uses_browser_http_transport)`; any drift means an automation step or person modified text the machine owns. Resolve by regenerating the printed CLI (run `printing-press regen` against this directory, or for a published CLI, regenerate from the spec and re-publish). If the canonical text itself is wrong (e.g., a real change to the install instructions is needed), fix the template, not the printed CLI.

When editing other parts of SKILL.md, Read the affected section first and Read it again after the Edit. `Edit` replaces a literal string; if the surrounding context has drifted, a single Edit can graft a second copy of a block onto the first instead of replacing it.

After fixing, re-run `"$PRINTING_PRESS_BIN" verify-skill --dir "$CLI_DIR"` and confirm exit 0 before moving on.

