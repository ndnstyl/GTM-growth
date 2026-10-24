# Plan and tasks: version control and CI

## Approach

1. Join the histories: one commit whose tree equals the working branch and whose parents are both lines, then point the trunk at it and tag the first release.
2. Protect the trunk on the host (an owner action).
3. Write the health script first. It is the definition of "healthy" for both seats.
4. Write the two seats as agent definitions with narrow tool lists: the committer can add and commit but not push or edit; the verifier can push and edit workflow files but not write new files.
5. Wire a release command that reads the changelog's Unreleased section.
6. Cut the backup to one set and add the restore drill.

## Tasks

- [ ] Task 01 Join commit and first tag
- [ ] Task 02 Trunk protection on the host (owner action; named in the gates file)
- [ ] Task 03 Health script: four checks, JSON output, exit code
- [ ] Task 04 Committer seat: refusal list, in-flight rule, per-kit commit messages
- [ ] Task 05 Verifier seat: push, poll, classify reds, bounded loop, receipt
- [ ] Task 06 Known-red list with owners; the CI gate job ignores it by design
- [ ] Task 07 Release command from the changelog
- [ ] Task 08 Backup prune to one set; restore drill
- [ ] Task 09 Planted-violation test for the committer (finished, in flight, credential)
- [ ] Task 10 Handoff SOP

## Gates

- G1: health script exits 0 on a clean day. CHECK: run it. EXPECT: exit 0.
- G2: the committer refuses a planted credential. CHECK: the planted-file test. EXPECT: the path is reported as refused, not committed.
- G3: a force push to the trunk is refused. CHECK: attempt it against a scratch clone. EXPECT: the host rejects.
