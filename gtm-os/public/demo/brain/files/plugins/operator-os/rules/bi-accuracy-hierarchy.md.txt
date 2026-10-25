# Accuracy Hierarchy: every number that feeds a decision

> Standing rule: if any of the foundation numbers is wrong, every report built on it is wrong. Apply it to every automated path that writes a figure into a system of record or produces a report from one. The pattern generalises beyond cost keying to revenue, lead counts, pacing and any number someone will act on.

## The hierarchy (a three-step function; the top gates the bottom)

```
Senior agent  (one, cross-source)       gates, verifies independently, runs the loop
   ^ packet + adversarial receipt
Report agent  (one per source)          computes the rows; a keying sub-lane writes them
   ^ evidence packet + adversarial receipt
Research agent (one per source)         pulls and proves the INPUTS; never computes, never writes
```

Nothing moves up a level without an adversarial-review receipt from the level that produced it, and the level that receives it runs its own adversarial pass before using it. Two pairs of eyes on every artifact, every day, by construction.

## Lanes (what each may do, and what it may never do)

**Research agent** (per source)
- Pulls the raw inputs: the spend feed or vendor sheet, the control of record, the reference tables, the fee schedule, the campaign map. Pins every input by checksum and as-of date.
- Proves the inputs before anyone computes on them: control of record present for every closed day; no empty window; detail sums to the control total; schema unchanged; no restated day since the last pin (or names it); every campaign with spend has a map row.
- Emits an **evidence packet** (inputs, pins, checks with PASS or FAIL) and its own adversarial receipt.
- MAY NOT compute a row, touch the system of record, or edit a config file. A failed input check is a HALT with a named cause, never a note.

**Report agent** (per source)
- Consumes only a research packet whose checks all PASS.
- Computes the rows and the day manifest; verifies every invariant in the contract (pairing, sum of parts equals the placed total, control gate to the cent, no zero rows); recomputes at least one figure a second way and shows both.
- **Keying sub-lane**: writes its source's rows under a dedicated identity with a fixed upsert key, after the senior agent's approval, and returns the row identifiers. The keying sub-lane never verifies its own write.
- Emits the keying sheet, the pass/fail matrix for its stage, and its adversarial receipt.
- MAY NOT change a tolerance, a fee, a map row or a zone assignment. MAY NOT read another source's inputs. MAY NOT declare its own rows correct.

**Senior agent** (one)
- Adversarially reviews every report packet (arithmetic by reproduction, grain, residuals, timezone, fee rule) and returns PASS, PASS-WITH-CONDITIONS or BLOCK per source. BLOCK sends the packet back down with the failing rows named; it never edits the packet.
- Approves the day's write batch across sources only when every source is PASS.
- **After the entire write is done**, pulls the system-of-record surface itself, independently of the keying sub-lane, and runs the full tie-out matrix at day and month grain against each source's control of record.
- Runs the **verification loop**: any FAIL sends the owning report agent to recompute, the keying sub-lane corrects by upsert, and the senior agent re-pulls and re-ties. The loop ends only at **100% PASS**, or at the round cap (three per day), which HALTS to the operator with the matrix attached. A halt is a valid exit; a widened tolerance, a dropped check or a "close enough" is not.
- Signs the daily receipt, and is the only lane that may call a day done.

## The pass/fail matrix (the artifact that says "done")

Every run produces a machine-readable matrix: one row per named check, with stage (research, report, keying, senior), source, PASS or FAIL, evidence (numbers, ids, file hashes), and the receipt that produced it. A day is complete when every row is PASS. Any FAIL row makes the day `incomplete`, never `done`, and the loop runs. A human reads the matrix first.

## The blocker gate for verifying seats

Any senior, reviewer or tie-out seat that finds a blocker asks one question first: **does closing this blocker write to a platform?** (your CRM, an ad platform, a vendor's sheet, a shared drive, email, anything outside this machine's own stores.)

- **Yes:** STOP. Name the blocker, the write, and the exact rows it would touch, and check with the operator. No exceptions, no "small" writes.
- **No, local only** (code, config, parquet, scheduled jobs on this machine, the vault, receipts): **stage version control first** (explicit-path commit or a copied snapshot), make the change, log it (receipt plus card entry with what changed, why, and the revert line), and continue. A ruled definition (a fee, tolerance, zone master, residual class) is still the operator's to change: propose it in the log, apply only what an existing ruling covers.

Enforce this with the `platform-write-gate` hook and its allowlist registry (it ships empty) plus `checkpoint-before-change`. The hook is the rule; this text describes it.

## Non-negotiables

1. **Triple check**: every number reaches the system of record only after (a) the research proof, (b) the report invariants, (c) the senior independent tie-out. Three code paths, two different pulls.
2. **Writer is not verifier.** The lane that writes a row never grades it. A read-back of what you wrote is not a verification. The senior agent's control comes from a different pull than the keying lane's.
3. **Adversarial review at every pass.** Skipping one is a defect in the run, not a shortcut.
4. **The loop is bounded and loud.** Three rounds, then HALT. No infinite loop, no silent retry.
5. **Nothing rounds to done.** 100% of matrix rows PASS or the day is incomplete.
6. **Only the operator changes a definition the matrix tests against.** Agents may propose; they never apply.
7. Implement the hierarchy in code (stages, the matrix) AND as agent seats. The code is the hook, the seats are the review.
