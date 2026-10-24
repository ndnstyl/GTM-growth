# Generated-artifacts ownership policy

> Referenced from `SKILL.md` (invocation guard) and restated in `references/package.md` (Step 6, inline script comment) and `references/greptile-review-loop.md` (after PR opens). Keep this text identical everywhere it appears.

The public library treats `library/<category>/<api-slug>/.printing-press.json`
and `manifest.json` as the source of truth for registry-display fields. Do not
edit `registry.json`, README catalog cells, or `cli-skills/pp-<api-slug>/SKILL.md`
in publish PRs; all three are bot-regenerated post-merge by the library's own
workflows. The library's `Fail on changes to generated artifacts` check in
`verify-library-conventions.yml` hard-fails any PR, fork or same-repo, whose
diff against base touches `registry.json` or `cli-skills/pp-*/SKILL.md`, so a
publish that includes either is pre-rejected before review.

The public library also owns per-CLI release accounting. Do not manually bump
`CHANGELOG.md`, `.printing-press-release.json`, or runtime `var version = ...`
for a publish PR. Fresh printed CLIs may include blank release-ledger skeletons;
the library's post-merge workflow assigns the final `YYYY.M.N` release and
stamps the runtime version after merge. When replacing an existing public
library CLI, preserve its existing release-ledger files so changelog history is
not lost in the reprint PR.

`blocked-apis.json` is different: it is a hand-maintained public-library journal,
not a generated registry surface. Journal-only PRs may edit `blocked-apis.json`
and must not stage `library/`, `registry.json`, README catalog cells, or
`cli-skills/`.
