> Loaded by SKILL.md as the fallback reference for any failure mode not otherwise handled inline.

## Error Handling

- **`gh` not authenticated:** Detect in Step 1, tell user to run `gh auth login`
- **CLI not found:** Show available CLIs in Step 2, let user pick
- **Validation fails:** Show per-check results in Step 4, stop
- **Repo unreachable:** Report clearly in Step 5
- **Fork creation fails:** `gh repo fork` may fail if the user already has a fork with a different name, or if the org restricts forking. Report the error and suggest the user fork manually via the GitHub web UI.
- **Collision check fails:** If `gh pr list` or `ls` commands fail (network, auth), warn but don't block, proceed as if no collision exists
- **Rename fails:** Show the error from `publish rename --json`. Offer to retry with a different qualifier or bail. If the publish repo is in a partial state, reset with `git checkout -- . && git clean -fd` before retrying
- **Branch conflict (no existing PR):** Ask user in Step 8 (overwrite or timestamp)
- **Push fails:** For fork users, ensure they're pushing to their fork (origin), not upstream. Report the error, suggest checking `gh auth status` and `git remote -v`
- **Cross-repo PR creation fails:** If `gh pr create --head user:branch` fails with "head not found", the branch wasn't pushed to the fork. Verify with `git ls-remote origin feat/<api-slug>`
