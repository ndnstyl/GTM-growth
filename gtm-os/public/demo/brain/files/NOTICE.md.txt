# Notices and credits

Operator OS code and prose are MIT licensed (see `LICENSE`). The pieces below were written by others or
adapted from their work and keep their own licences. Status column: **kept** means the licence file ships in
the skill folder; **text below** means the licence is reproduced in this file.

| Component (under `plugins/operator-os/skills/`) | Upstream | Licence | Status |
|---|---|---|---|
| `skill-creator` | Anthropic skill-creator | Apache-2.0 (`LICENSE.txt` in the folder) | kept |
| `karpathy-guidelines` | https://github.com/multica-ai/andrej-karpathy-skills | MIT | text below |
| `task-observer` | adapted from "One Skill to Rule Them All" by Eoghan Henn, https://github.com/rebelytics/one-skill-to-rule-them-all | CC BY 4.0 (attribution in the skill file) | credit in file |
| `your-voice/unslop.md` | adapted from the unslop skill in https://github.com/mattpocock/skills | MIT | text below |
| `plugins/operator-os/specify/templates/*` | shaped after the template set in https://github.com/github/spec-kit; gates template idea from https://github.com/Leonxlnx/unlazy | MIT | text below |
| `vibe-security` | https://github.com/raroque/vibe-security-skill (Chris Raroque, Aloa) | MIT | text below |
| `diagnosing-bugs`, `tdd`, `codebase-design`, `grill-me`, `writing-great-skills` | https://github.com/mattpocock/skills (Matt Pocock) | MIT | text below |
| `diagnose`, `grill`, `writing-for-agents` | adapted from the Matt Pocock skills above | MIT | text below |
| `lint`, `ingest`, `synthesize`; `scripts/memory/vault-search.py`, `vault-lint.py` | pattern adapted from https://github.com/AgriciDaniel/claude-obsidian and Andrej Karpathy's LLM wiki pattern | MIT | text below |
| `frontend-design` | Anthropic example skill | Apache-2.0 (`LICENSE.txt` in the folder) | kept |
| `printing-press` and `printing-press-amend`, `-import`, `-output-review`, `-polish`, `-publish`, `-reprint`, `-retro`, `-score` | https://github.com/mvanhorn/cli-printing-press | MIT | text below |

The printing-press skills name https://github.com/mvanhorn/printing-press-library as a remote they read from or
publish to at run time. None of that repository's content ships here, because it carries no licence.

Not shipped: `excalidraw-diagram`, `remotion`, `3d-web-experience`, `data-literacy`, `system-design-review` and
`sop-creator`, because no licence or origin could be verified. Two are recommended as installs from their authors;
see `docs/companion-skills.md`.

Text-only edits made to third-party files: employer-specific and machine-specific strings were removed, and
literal loopback-address examples in the `printing-press` references were reworded. No behaviour was changed.

## MIT licence text (applies to the components marked "text below")

Copyright notices of the upstream works covered by this text:

- Copyright (c) 2026 Matt Pocock (mattpocock/skills, and the skills adapted from it)
- Copyright (c) 2025 Chris Raroque (raroque/vibe-security-skill)
- Copyright (c) 2026 AgriciDaniel, AI Marketing Hub (AgriciDaniel/claude-obsidian)
- Copyright (c) 2026 Matt Van Horn and Trevin Chow (mvanhorn/cli-printing-press)
- Copyright (c) 2026 Leonxlnx (Leonxlnx/unlazy)
- Copyright GitHub, Inc. (github/spec-kit)
- multica-ai/andrej-karpathy-skills: the skill file declares the MIT licence in its own header and the
  repository publishes no separate copyright line, so none is reproduced here.

The CC BY 4.0 work, "One Skill to Rule Them All" (Copyright (c) 2026 Rebelytics, Eoghan Henn), is credited in
the task-observer skill file.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Fonts

The docs site serves Fraunces, Inter and JetBrains Mono (latin subsets, woff2) from `docs/assets/fonts/`. All three are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), copyright their respective authors as listed at https://fonts.google.com.
