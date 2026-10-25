# Warehouse-First, structured data comes from the warehouse, never from CLI reasoning

> Hard rule. Structured data lives in a warehouse (or a database, or a governed set of files with a
> defined grain). Numbers come from deterministic queries over it, not from an agent adding figures
> in a terminal.

## The rule

1. **Structured data lives in the warehouse.** Every cost dollar, revenue figure, KPI, or any number
   with a defined grain is rows in your warehouse of record. Not a spreadsheet, not a text render of a
   vendor report, not a file summed by hand.

2. **Numbers come from queries, not reasoning.** A structured figure is produced by a deterministic
   query or view over the warehouse: one definition, reused everywhere, same input to same output every
   time. An agent never hand-computes, eyeballs, reconciles, or reasons a structured number in the CLI
   and presents it as an answer. If you catch yourself adding figures in prose or a scratch script to
   reach a headline number, stop: that is the violation.

3. **Three roles, always.** One pass proves and pins the inputs, a second computes and recomputes a
   second way, a third ties out from a different pull. A pass/fail matrix is the gate: 100% PASS or the
   number is `incomplete`.

## What is allowed vs forbidden

- **Allowed:** exploratory queries, sanity checks, reading a single fact, building the loaders and views
  that populate the warehouse, the sanctioned pipeline modules.
- **Forbidden as a delivered answer:** summing a governed dataset with an ad-hoc `python`/`awk`/`jq`/
  `duckdb` one-liner and presenting the total or a derived % / ratio as the number. That figure is a
  hypothesis, not an answer; prove it in the warehouse first.

## Why a hook, and how to add yours

Anything that MUST happen is a hook, not an instruction. Hand-reasoning is non-deterministic by
construction: it misses sources, moves between runs, and cannot be audited. A pre-tool hook that fires
on the ad-hoc aggregation pattern over your governed datasets is a good backstop; the architecture
(data in the warehouse, compute as views) is the real enforcement. The plugin does not ship this hook
because the dataset names are yours. Write one in your project's hooks folder, modelled on
`block-silent-failure.sh`.

## When building a new number

Land the data as structured rows, define the compute as a query or view once, run it through the three
roles, read the number off the matrix. Never sum a file to a headline figure.
