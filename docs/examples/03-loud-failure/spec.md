# Loud Failure Everywhere (case study: Harbor & Pine Home Services)

**Status**: Built, register running daily | **Created**: 2026-05-20 | **Owner**: Dana Ortiz (fictional)
**Input**: "Loud failure needs to be implemented in absolutely anything that can break: any transfer, lookup, call, tool use, handoff, skill load, teardown, credential need. There isn't a single thing that should fail silently."

## The problem in one paragraph

A call-recording analysis job ran for 65 minutes dispatching nothing while both model machines idled at zero percent. The producer's output format had changed; the consumer waited for a signal that would never arrive again. The job's receipt said "running" the whole time. The company already had a written rule against silent failure, but it covered pipelines, was enforced by nothing, and a whole class of failure, waiting, sat outside it.

## Why it is a program and not a fix

A scan of the harness found 600 places where an exception is caught and dropped, 170 shell scripts with no error-exit option, and 150 `|| true` suppressions. Each is a place where something can break and nobody is told. The count is the problem statement.

## Scope

Every component, by the owner's list: transfer, lookup, call, tool use, handoff, module or skill load, teardown, credential need. Every language in use. Consent, suppression and contact-permission paths are CRITICAL at any size. Out of scope: third-party library internals; in scope: every call into them.

## User stories

### Story 1: Nothing new fails silently (P1)

A write-time gate refuses a new silent-failure site in harness code and quotes the rule. Done when it is installed, tested against planted violations in each language, and cannot be satisfied by reformatting.

### Story 2: The register exists and is honest (P1)

One command scans the repository and lists every site by component, severity, language and owner, with exempted sites counted separately and each exemption carrying a reason. Done when it runs clean twice and its own tests plant and detect one violation of every class.

### Story 3: The governed lanes are clean (P1)

Every lane touching consumer contact or regulated data has zero open rows or a ruled exemption with a reason.

### Story 4: Waiting is observed (P1)

A scheduler census reads the process table, not the task's own report. It flags orphans, stalled jobs (no CPU, no bytes written), spinning jobs (CPU busy, nothing written), over-budget runs, and death loops.

## The rule it produced

A failure path ends in exactly one of three things: a raised error that names what failed, what was expected and what would fix it; a visible refused or held state in a place a human reads; or an alert row in a surface someone watches. A swallowed exception, a default substituted for a missing answer, a `continue`, a bare print, a 200 on failure, and a silent retry that exhausts are all violations. Every wait carries a deadline, because a blocked process and a working one look identical from outside.

## Requirements

- **REQ-01**: The write-time gate checks Python, shell, Node, SQL and workflow JSON.
- **REQ-02**: An exemption is an in-line marker with a reason; a marker with no reason is itself a violation.
- **REQ-03**: Receipts carry units done and the time of the last unit, so a watchdog checks progress, never that a file was touched.
- **REQ-04**: A supervisor decision tree runs every five minutes on anything long: died, healthy, one long unit, spinning, blocked, runaway.

## Success criteria

- **SC-001**: The register's count falls to zero un-exempted rows in governed lanes within 30 days.
- **SC-002**: A planted stall (a consumer waiting on a signal that never comes) is reported within one supervisor cycle.
- **SC-003**: No new un-exempted site is merged in the 30 days after the gate ships.

## What the case study teaches

The prose rule existed for months and changed nothing. The gate, the register and the census are what changed behavior. Write the rule as code.
