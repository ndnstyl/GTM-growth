> Loaded by SKILL.md's `references/branch-commit-pr.md` (Step 8) when building the PR body. Fields are gathered from Steps 2, 4, 4.5, 6, and 7, see that file's "What to gather before filling this template" section.

**PR description template:**

```markdown
## <api-slug>

<If this is a Replace path, add: "⚠️ **Replaces existing `<api-slug>`**, <reason from user>">

<description from manifest, or "No description available">

**API:** <api_name> | **Category:** <category> | **Press version:** <printing_press_version>
**Spec:** <spec_url or "Not specified">

### Publication Path

<New print | Update existing PR #N | Reprint/replace | Alongside print from <original-api-slug>>

### CLI Shape

\`\`\`bash
$ <cli-name> --help
<help_output from validation>
\`\`\`

### Novel Commands

| Command | Name | Description |
|---------|------|-------------|
| `<command>` | <name> | <description> |

### What This CLI Does

<First 2-3 paragraphs from README.md in the CLI directory, or "README not found">

### Manuscripts

<!-- One bullet per file, NOT one per directory. Repeat the research/ row for every file in research/, and the proofs/ row for every file in proofs/. Use a human label that matches the file (e.g. `Research Brief`, `Absorb Manifest`, `Novel Features Brainstorm`, `Phase 5 Acceptance`). Substitute `<HEAD_SHA>` with the value captured after push. Do NOT use relative paths. -->

- [<label>](https://github.com/mvanhorn/printing-press-library/blob/<HEAD_SHA>/library/<category>/<api-slug>/.manuscripts/<run-id>/research/<filename>)
- [<label>](https://github.com/mvanhorn/printing-press-library/blob/<HEAD_SHA>/library/<category>/<api-slug>/.manuscripts/<run-id>/research/<filename>)
- … (one bullet for each remaining file in `.manuscripts/<run-id>/research/`)
- [<label>](https://github.com/mvanhorn/printing-press-library/blob/<HEAD_SHA>/library/<category>/<api-slug>/.manuscripts/<run-id>/proofs/<filename>)
- [<label>](https://github.com/mvanhorn/printing-press-library/blob/<HEAD_SHA>/library/<category>/<api-slug>/.manuscripts/<run-id>/proofs/<filename>)
- … (one bullet for each remaining file in `.manuscripts/<run-id>/proofs/`)

### Validation Results

| Check | Result |
|-------|--------|
| Manifest | PASS/FAIL |
| Phase 5 | PASS/FAIL |
| go mod tidy | PASS/FAIL |
| govulncheck (this CLI only, reachable findings) | PASS/FAIL |
| go vet | PASS/FAIL |
| go build | PASS/FAIL |
| --help | PASS/FAIL |
| --version | PASS/FAIL |
| Manuscripts | PRESENT/MISSING |

### Publish Live Gate

<If Step 4.5 ran dogfood: "Full live dogfood reran at publish time and passed. Proof: `<proof path or manuscript link>`">
<If Step 4.5 was skipped: "Skipped with explicit reason: `<SKIP_LIVE_TEST_REASON>`">

### Gaps

<List any missing manifest fields, or omit this section if everything is present>
```
