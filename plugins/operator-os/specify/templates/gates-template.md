# GATES: <task name> (<date>)

> The idea comes from the MIT-licensed `unlazy` approach (Leonxlnx/unlazy): done is proven against this file, never claimed. Write it BEFORE starting real work. A gate with a runnable CHECK beats a gate graded by opinion. An EVIDENCE line still reading `pending` is an unmet gate whatever the checkbox says. Dropping a gate silently is forbidden; the only honest exit is an ABANDON line, surfaced in the report.

## Gates

- [ ] G1 <outcome in one sentence>
      CHECK: <command that goes red if this is not true>
      EXPECT: <what the command must print or exit with>
      EVIDENCE: pending

- [ ] G2 <outcome that cannot be commanded: a manual gate>
      EVIDENCE: pending  <!-- replace with a measurement, quoted output, or file and line -->

## Abandoned (honest exits only)

<!-- ABANDON: G<n> <reason> -->

## Report rule

The final report pastes this ledger. Every box checked with evidence, or the task is not done. Put a positive control beside any absence claim: a check that cannot fail proves nothing.
