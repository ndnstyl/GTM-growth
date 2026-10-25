# Loud Failure, every component, every failure path, no exceptions

> Standing rule: **loud failure is implemented in absolutely anything that can break: any transfer,
> lookup, call, tool use, handoff, skill load, dismount, credential need. Nothing fails silently.**
> Enforced at write time by the `block-silent-failure` hook in this plugin.

## The rule

**A component that can fail without raising an alarm is incomplete and does not ship.** Every
failure path terminates in one of exactly three things:

1. **A raised error** that names what failed, what was expected, and what would fix it, carried to a
   non-zero exit at the process boundary.
2. **A visible refused or held state** written where a human reads it (the receipt, the status card,
   the run row, the report cell), never a skip.
3. **An alert-sink row** in a surface someone actually watches (job health, the work ledger, the
   alignment check).

A swallowed exception, a default value substituted for a missing answer, a `continue`, a bare
`print`, a `|| true`, a `2>/dev/null` that hides a real error, an HTTP 200 on failure, an empty list
where a lookup failed, or a silent retry that exhausts and returns nothing are all violations.

## The component taxonomy (each with its required contract)

| Component | Fails silently when | Required |
|---|---|---|
| **Transfer** (rsync, scp, upload, ship, download) | partial transfer reads as success; verify counts bytes it just wrote | verify by hash against the source, refuse on mismatch, never unlink before the verify passes |
| **Lookup** (query, join, config read, registry read) | a miss returns a default, an empty set, or zero | a miss is a named error unless absence is a ruled, documented answer; a count of zero prints its basis |
| **Call** (vendor API, local service, model, database) | non-2xx swallowed, timeout returns None, retry exhausts quietly | classify refusal vs unreachable vs expiry; each exits with its own named reason; exhausted retries are an error, never a return |
| **Tool use** (a script calling another script, an MCP tool, a subprocess) | exit code unchecked, stderr discarded | check the exit code, carry stderr into the error, never `2>/dev/null` on a path that can fail |
| **Handoff** (stage to stage, host to host, producer to consumer) | the consumer polls for a signal the producer no longer sends | the signal is checked for existence and freshness, the consumer names its producer, every wait has a deadline and dies loudly at it |
| **Skill or module load** (import, skill file, prompt, config version) | a missing file falls back to a default or an older version | a missing or unsigned artifact refuses; a version mismatch refuses; never silently use the previous one |
| **Dismount / teardown** (volume unmount, backup target, cleanup, close) | the unmount fails and the next write lands on the boot disk | assert the post-condition (mounted, unmounted, closed, flushed) and fail on it; a cleanup that could not run is reported |
| **Credential need** | a missing credential yields an empty pull, a skipped step, or an anonymous call | refuse with exit 3 naming the credential, the host, and the step that supplies it; never degrade to a partial run |

## Liveness is part of failure

A process that is blocked and a process that is working look identical from outside. Therefore:

- **No unbounded wait anywhere.** Every poll and wait carries a deadline; reaching it is an error
  naming what was awaited and for how long.
- **Progress, not presence.** A stage running with zero units completed inside its stall window,
  while work remains, exits non-zero. Receipts carry units done and the time of the last unit.
- **Watchdogs check progress**, never that a file was touched.

## A process an agent starts dies with the agent or lives under a scheduler (hard rule)

A build agent that starts a test database with a detached background launch, reports itself blocked,
and ends leaves a database running for days with no owner. Hung test runners accumulate the same way.
Long-running work needs a check for "stuck or in a death loop".

1. **No detached launches.** An agent never uses `nohup`, `setsid`, `disown`, `pg_ctl start`, a bare
   `postgres -D`, or `&` on a server it does not wait for or kill in the same command. It uses the Bash
   tool's `run_in_background` (tracked by the harness, stopped with the session), or starts and stops
   the server inside the test. A service that must stay up is a row in your scheduler's manifest (launchd, systemd, or a supervisor).
2. **The one exception is marked and stopped:** `# detach-ok: <why>; stop: <exact stop command>`, and
   the agent runs the stop command before it reports. A subagent that ends with something still
   running says so in its report, with the stop command.
3. **Long runs are allowed; silent ones are not.** A run of hours or days is fine while it progresses.
   A job expected past six hours declares its maximum runtime in your liveness config.
4. **Every model or network call carries its own timeout.** A job whose only deadline is its outer
   wrapper waits out the whole wrapper on one hung call, then restarts into the same hang: a death
   loop with a twelve-hour period.

## The five-minute supervisor (hard rule)

> Any loop or long task with high token usage, especially one that is not real time, runs a real
> time check on token usage, looks for stalls and probes on its own for anything taking longer
> than 5 minutes.

**Anything still running at five minutes supervises itself, and keeps supervising every five
minutes until it ends.** This binds loops, batch jobs, backfills, model passes, transfers, delegated
agents and background tasks. It binds hardest where no human is watching, which is most of the time.

### What a supervisor reads each cycle

Never a status word, never a file's modification time. Six facts:

| Fact | Source |
|---|---|
| elapsed | wall clock from `date`, not an estimate |
| units done, and the change since the last cycle | the stage's own counter |
| time of the last completed unit | the heartbeat |
| tokens or compute spent, and the change since the last cycle | the meter row or the agent's usage |
| process alive | the process table on the host that runs it |
| resource busy | a direct probe: GPU utilization, CPU seconds moving, socket state, output file growing |

### The decision tree, in order. The first branch that matches wins.

```
IF the process is gone and the stage is not complete
    -> DIED. Loud error with the last log line as the cause. Restart once from disk state
       under the same run id, then refuse and report.

ELSE IF units advanced since the last cycle
    -> HEALTHY. Write the heartbeat, recompute the rate from measured units, revise the
       finish time, check again in five minutes.

ELSE IF units are flat and the resource is genuinely busy
    -> ONE LONG UNIT. Name the unit and the evidence (percent busy, CPU seconds, bytes grown).
       Grant one extension window. Flat again after two extensions is a STALL, not a long unit.

ELSE IF units are flat and tokens or compute are being spent
    -> SPINNING. This is the expensive silent failure: work is being paid for and nothing is
       being produced. Loud error, stop, report. Never let it ride because it "looks busy".

ELSE IF units are flat and nothing is being consumed
    -> BLOCKED. Probe the dependency chain: upstream signal present and fresh, credential
       present, host reachable, disk writable, queue non-empty. Name the blocker in the error.
       No blocker found means WEDGED: restart once, then refuse and report.

ELSE IF spend has passed the declared budget
    -> RUNAWAY. Stop it. Report what it cost and what it produced.
```

### Rules that make the tree work

1. **Declare the budget before you start.** A long task states its expected units, its expected
   duration and its token or compute ceiling up front. No declaration means no budget branch, which
   means the task is unsupervisable and does not ship.
2. **Five minutes is the ceiling, not the target.** A cheap probe may run more often. Nothing runs
   longer than five minutes unobserved.
3. **The supervisor probes, it does not ask.** It reads the machine, never the task's own report of
   itself. A task that says it is running is evidence of nothing.
4. **Every branch except HEALTHY writes an error where a human reads it**: the receipt, the work
   ledger row, stderr with a non-zero exit, and the board card when it ends the run.
5. **Escalation is bounded.** One automatic restart per cause, a cap of three per job per day, then
   it reports and stops trying. Silent retry forever is the failure this rule exists to kill.
6. **This applies to delegated agents too.** An agent that has not reported in five minutes gets
   probed by its delegator against the same tree, with tokens spent as the spend signal and files
   changed or tests run as the units signal.

## How it is enforced

- The plugin's `block-silent-failure` hook (PreToolUse on Write and Edit) refuses new occurrences of
  the violation patterns in code, with the rule line quoted back. If you keep a register scanner at
  `scripts/ops/loudfail/audit.py` in your project, the hook calls it; otherwise it prints
  "not configured" once and uses its built-in patterns.
- Exemptions are explicit, in-line, and named: `# loud-failure-exempt: <reason>` on the line. An
  exemption with no reason is a violation.
- Consent, suppression, do-not-contact and contact-permission paths are **CRITICAL** at any size.
  A silent failure there is never a warning.
- The plugin's `block-detached-process` hook (PreToolUse on Bash, every session and subagent) refuses
  a detached launch at command position.
- A census of the process table (orphans, stalled, spinning, over-budget, death loops) belongs in your
  own scheduler; it reads the process table, never a task's report.
