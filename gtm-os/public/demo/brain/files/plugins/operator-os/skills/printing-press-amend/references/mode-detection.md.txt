# Phase 0, Input Mode Detection for `/printing-press-amend`

This reference is loaded right after setup and before Phase 1. It decides which input source feeds the finding list Phase 1 will produce.

**Cross-cutting thread:** `MODE` is set here and reshapes Phase 1 (which sub-section runs), Phase 4's `dogfood_status` output field, and Phase 8's final RESULT block. Every later phase reads `MODE` from `$PRESS_RUNSTATE/current/mode.txt` rather than re-deriving it.

This skill accepts two input sources for the finding list it later patches: a Claude Code session transcript (dogfood mode, current behavior) and user-supplied asks in the slash-command prompt (direct-input mode, added in v0.2). The two modes diverge only in Phase 1; Phase 2 onward is mode-agnostic and consumes a typed finding list with identical shape regardless of source.

Decide the mode before Phase 1 runs.

## Detection rubric

Read the slash-command prompt body and the immediate invocation turn from the conversation context. Classify into one of four branches:

- **`MODE=direct`**, the prompt contains a concrete CLI name AND at least one direct-input signal:
  - Action verbs targeting the CLI: `rename`, `add`, `remove`, `fix`, `sniff`, `discover`
  - Explicit URLs the user wants added (e.g., `https://example.com/feed/x`)
  - An enumerated list of feeds, commands, endpoints, or features
  - Phrasing like "these ideas", "these features", "with the following"
- **`MODE=dogfood`**, the prompt is empty, OR names a CLI without any asks ("amend the superhuman CLI"), OR explicitly references the session ("what I just dogfooded", "this session's friction", "from my session today")
- **`MODE=both`**, the prompt clearly references both: a session AND specific asks ("I dogfooded this session and also want to add feature X", "in addition to the friction I hit, please add command Y")
- **Ambiguous**, only one signal is present (CLI named with no verbs, or verbs with no target CLI, or asks worded so they could be friction reports OR new asks). Ask the user via `AskUserQuestion`:

  > "Two ways to source findings for this amend. Which fits?
  >   1. Mine the current session transcript (dogfood mode)
  >   2. Use the asks I just typed (direct-input mode)
  >   3. Both, combine transcript friction with my asks"

Default when no slash-command prompt is present at all: `MODE=dogfood`. This preserves the canonical UX, `/printing-press-amend` with nothing after still works exactly as it did in v0.1.

## Persist the mode

Write the resolved mode to `$PRESS_RUNSTATE/current/mode.txt` so later phases (and a resumed run) can read it:

```bash
echo "$MODE" > "$PRESS_RUNSTATE/current/mode.txt"
```

## Output

Phase 0 emits one line to Phase 1:

```yaml
mode: <dogfood|direct|both>
```

Phase 1 branches on this value, dogfood findings flow through `### 1a`, direct-input findings flow through `### 1b`, and combined runs execute both sub-sections in sequence. Phase 2 onward ignores the mode entirely, the finding list is the contract.
