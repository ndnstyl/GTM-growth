---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
license: Complete terms in LICENSE.txt
---

# Skill Creator

This skill provides guidance for creating effective skills.

Skill creation involves these steps:

1. Understand the skill with concrete examples
2. Plan reusable skill contents (scripts, references, assets)
3. Initialize the skill (run init_skill.py)
4. Edit the skill (implement resources and write SKILL.md)
5. Package the skill (run package_skill.py)
6. Iterate based on real usage

Follow these steps in order, skipping only if there is a clear reason why they are not applicable.

## Navigation

Read the file for the step you're on. Files are one level deep and self-contained.

| Topic | File | When to read it |
|---|---|---|
| Skill theory (About Skills, Core Principles, Anatomy, What Not to Include) | [references/principles.md](references/principles.md) | Before building any skill, or when unsure what belongs in SKILL.md vs. bundled resources |
| Progressive disclosure design patterns | [references/progressive-disclosure.md](references/progressive-disclosure.md) | When SKILL.md is growing large, or deciding how to split content across reference files |
| Step 1-2: Understand + Plan | [references/plan.md](references/plan.md) | Before building, gathering concrete examples and deciding what scripts/references/assets to include |
| Step 3-4: Initialize + Edit | [references/setup.md](references/setup.md) | While building, running init_skill.py and writing SKILL.md content |
| Step 5: Package | [references/step-5-package.md](references/step-5-package.md) | When the skill is complete and ready to validate + zip |
| Step 6: Iterate | [references/step-6-iterate.md](references/step-6-iterate.md) | After real usage surfaces gaps or friction |

## Design pattern references

Consult these while writing SKILL.md content (step 4, see [references/setup.md](references/setup.md)):

- **Multi-step processes**: [references/workflows.md](references/workflows.md), sequential workflows and conditional logic
- **Specific output formats or quality standards**: [references/output-patterns.md](references/output-patterns.md), template and example patterns

## Tooling

- `scripts/init_skill.py <skill-name> --path <output-directory>`, scaffold a new skill directory (step 3)
- `scripts/package_skill.py <path/to/skill-folder> [output-dir]`, validate and zip a completed skill into a `.skill` file (step 5)
- `scripts/quick_validate.py`, run the same validation package_skill.py runs, without packaging
