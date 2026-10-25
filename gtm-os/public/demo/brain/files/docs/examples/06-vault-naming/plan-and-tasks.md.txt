# Plan and tasks: vault naming

## Approach

1. Write the map generator as a dry run. Review collisions with the owner on a sample of 40.
2. Build the migration as checkpoint, rename, rewrite, lint, compare, with automatic rollback.
3. Test on a copy of the vault with one planted unresolvable link.
4. Run on the real vault; push the result to the canonical copy; verify by checksum.
5. Teach the lint and the distill skill the convention.

## Tasks

- [ ] Task 01 Rename-map generator (dry run only), collision report
- [ ] Task 02 Owner review of a 40-note sample; convention v1 frozen
- [ ] Task 03 Migration with checkpoint, link rewrite, alias insertion
- [ ] Task 04 Auto-rollback gate on lint counts; planted-break test on a copy
- [ ] Task 05 Search the codebase for citations of old names; fix in the same pass
- [ ] Task 06 Run on the real vault; compare counts; push and verify checksum
- [ ] Task 07 Lint warns on prefixed or snake_case names; distill skill updated
- [ ] Task 08 Handoff SOP: how to rename a note safely by hand

## Gates

- G1: dry run changes nothing. CHECK: diff the vault before and after the dry run. EXPECT: empty.
- G2: planted break rolls back. CHECK: run on the copy. EXPECT: vault identical to the checkpoint, the broken link named.
- G3: no new broken links. CHECK: lint counts before and after on the real run. EXPECT: after at or below before.
