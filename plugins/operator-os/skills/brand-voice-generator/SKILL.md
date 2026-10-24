---
name: brand-voice-generator
description: |
  Generate tone-of-voice and brand-system files for use with the PPTX Generator and other brand-aware skills.

  TRIGGERS - Use this skill when user says:
  - "help me create a brand system" / "set up my brand"
  - "generate my tone of voice" / "create my voice guidelines"
  - "configure my brand for presentations" / "set up brand for slides"
  - "create brand files" / "initialize my brand"
  - Any request about defining brand identity, voice, or visual system for content creation

  Creates brand.json, config.json, brand-system.md, and tone-of-voice.md files.
---

# Brand & Voice Generator

Generate complete brand configuration files for use with the PPTX Generator and other brand-aware skills. This skill guides users through an interactive process to define their brand identity and writing voice.

## What This Creates

| File | Purpose | Used By |
|------|---------|---------|
| `brand.json` | Colors, fonts, assets | PPTX Generator, Excalidraw |
| `config.json` | Output settings | PPTX Generator |
| `brand-system.md` | Design philosophy & guidelines | All content skills |
| `tone-of-voice.md` | Writing voice & personality | LinkedIn, X, PPTX content |

## Output Location

Files are created in:
```
.claude/skills/pptx-generator/brands/{brand-name}/
```

---

## Process Overview

1. **Gather Brand Basics** - Name, description, primary use case
2. **Define Colors** - 10 color values for the complete system
3. **Define Typography** - Heading, body, and code fonts
4. **Define Assets** - Logo and icon paths
5. **Discover Voice** - Personality, vocabulary, sentence patterns
6. **Create Design Philosophy** - Core principles and signature elements
7. **Generate Files** - Create all four files with gathered information
8. **Verify Setup** - Confirm files are correctly placed

---

## Step Files

Each step's detailed guidance lives in its own reference file. Read the relevant one when you reach that step.

| Step | File |
|------|------|
| 1. Gather Brand Basics | `references/01-gather-basics.md` |
| 2. Define Colors | `references/02-define-colors.md` (discovery workflow; ready-made palettes in `references/color-presets.md`) |
| 3. Define Typography | `references/03-define-typography.md` |
| 4. Define Assets | `references/04-define-assets.md` |
| 5. Discover Voice | `references/05-discover-voice.md` (examples in `references/voice-templates.md`) |
| 6. Create Design Philosophy | `references/06-design-philosophy.md` |
| 7. Generate Files | `references/07-generate-files.md` (templates: `references/tone-template.md`, `references/brand-template.md`) |
| 8. Verify Setup | `references/08-verify-setup.md` |

### Other modes

- **Quick Mode** (trigger phrases: "quick setup", "just the basics", "minimal brand", "get started fast") -> `references/quick-mode.md`
- **Updating an Existing Brand** -> `references/update-existing.md`

---

## Checklist

- [ ] Gather brand name and description
- [ ] Collect all 10 color values (or suggest defaults)
- [ ] Collect 3 font names (or use defaults)
- [ ] Determine asset paths
- [ ] Discover voice through questions
- [ ] Define design principles
- [ ] Generate brand.json
- [ ] Generate config.json
- [ ] Generate tone-of-voice.md
- [ ] Generate brand-system.md
- [ ] Create assets folder
- [ ] Verify all files created
- [ ] Remind user about logo copying
- [ ] Suggest test generation
