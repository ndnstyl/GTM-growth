# Phase 6, PR Draft Review Checkpoint (User-in-Loop #2) for `/printing-press-amend`

This reference is loaded after Phase 5's PII scrub and before Phase 7's PR open. This is the second and final user checkpoint. Everything that follows is unattended (push + PR-open + labels + RESULT block). Show the user EVERYTHING that's about to ship before any `gh` command fires.

Include the documentation checkpoint result from Phase 4 in this review so undocumented user-facing changes cannot slip into the PR.

**Cross-cutting threads:**
- `scope_tier` (set in Phase 3, see `scope-checkpoint.md`) is read here to pick the PR title prefix and the priority label.
- The PR body's Evidence section links to `.printing-press-patches/<id>.json` at the PR's HEAD SHA, the same patch-file schema Phase 4 (`plan-execute-validate.md`, Step 3) writes. Keep the two in sync if the schema changes.

## Assemble the draft

Compose the PR title, body, labels, and diff summary in memory. Title format follows the public library convention:

- `fix(<api-slug>): <one-line summary>` when the scope is bugs-only
- `feat(<api-slug>): <one-line summary>` when the scope includes features
- `feat(<api-slug>): <one-line summary>` when mixed (feature wins because it's the bigger contract change)

The `<one-line summary>` is composed from the most important 1-3 findings (e.g. `surface refresh-token expiry; add drafts new + --type sent`).

PR body sections (per origin R27):

1. **Summary**, 1-3 sentences naming the user pain and the shape of the fix
2. **Findings**, table with ID, category, type (bug/feature), rationale
3. **Changes**, output of `git diff --stat upstream/main..HEAD`
4. **Verification**, build/test/dogfood/validate status from Phase 4, plus the
   documentation checkpoint result
5. **Evidence**, full GitHub URLs to the per-run plan doc and the `.printing-press-patches/` directory at the PR's HEAD SHA (captured AFTER push so links don't 404)
6. **Closes #N** footer when an issue match was found in Step 6 of `library-pr-plumbing.md`

Labels: propose `comp:<api-slug>` always; `priority:P1` for bugs-only scope, `priority:P2` for bugs+features, `priority:P3` for all-tiers. Before applying labels to the upstream library PR, query the target repository with `gh label list --repo mvanhorn/printing-press-library --json name --jq '.[].name'` and apply only labels that exist there. If a proposed label is absent, skip it and note the skip in the PR body or final run log; do not let a missing per-CLI or priority label fail the amend flow.

## Display before gh fires

Show the user the title, body, label list, and `git diff --stat`. If Phase 5 surfaced unrecognized capitalized phrases that the user accepted as legitimate, RE-DISPLAY those inline now with the sentence each appears in:

> "Reminder: PR body references `<phrase>` (you accepted as legitimate during Phase 5). Confirm before opening."

## AskUserQuestion: open / edit / hold / abort

```
PR draft ready. What now?
  1. Open PR as drafted (recommended)
  2. Edit then open, drop into an interactive review of title/body
  3. Hold, save plan + diff for later resume; nothing pushed
  4. Abort, discard everything, no record kept
```

For **edit then open**: present the title and body as separate editable blocks, accept the user's revisions, re-display the full draft, confirm before proceeding.

For **hold**: save the plan + diff to `$PRESS_MANUSCRIPTS/<slug>/<run-id>/proofs/<timestamp>-amend-<cli-name>-HELD.md` and `${path%.md}.diff`. Emit a RESULT block with `status: held` and the resume path. A future `/printing-press-amend` run can detect held files and offer to resume.

For **abort**: emit a brief confirmation. Plan doc from U5 stays (with `status: aborted` written into the frontmatter) so the user has a record of what was found, but nothing else is preserved. Managed clone is reset on next run.
