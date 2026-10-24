# API Rate Governor (case study: Harbor & Pine Home Services)

**Status**: Observing, then enforced | **Created**: 2026-04-11 | **Owner**: Dana Ortiz (fictional)
**Input**: "The limits of every server we ping must be coded in, set well under the vendor's number. Being flagged or throttled by a vendor is a business risk, and it grows when 30 call-center users start living on these screens."

## The problem in one paragraph

On a Tuesday the hourly reports build walked into the ad platform's daily quota and kept walking: 1,100 quota errors in a day, hundreds of doomed retries seconds apart, an hourly job retrying a block its own error said would last fifteen hours. The fix shipped that day was reactive: back off after the vendor says no. Nothing prevented approaching the limit in the first place, and nothing even recorded what the limits were.

## User stories

### Story 1: A lane can never spend a vendor's quota (P1)

Every scheduled job that calls a vendor draws from a per-vendor budget set well under the vendor's documented limit. When it is spent, further calls are not sent: the lane reports itself skipped-for-budget with the time it resumes, and the data it could not refresh is served stale with its age visible, never silently missing.

**Independent test**: set one vendor's budget artificially low, run its lane, and verify the vendor receives no calls beyond the budget, the lane reports skipped-for-budget with a resume time, and previously rendered data still serves.

### Story 2: A 429 in one process protects all of them (P1)

After a quota error, every process refuses that vendor until the cooldown ends, using one shared record, not each script's memory.

### Story 3: A new vendor cannot be called until it has a row (P2)

In enforce mode an unregistered vendor is refused and recorded as an incident naming the caller.

### Story 4: Twenty to fifty viewers do not multiply vendor traffic (P1)

Viewer screens read centrally rendered artifacts. A feature that would fire a vendor call per click needs its own registry row and ratified ceiling before it ships.

## Requirements

- **REQ-01**: One registry row per vendor: window, ceiling, documented limit, source URL and date checked, minimum spacing, per-run cap.
- **REQ-02**: `acquire()` is the only path; it counts under a file lock so two processes cannot both spend the last call.
- **REQ-03**: Two modes. Observe counts and records and never refuses; enforce refuses. A vendor stays in observe until a few days of real counts exist and the owner ratifies a ceiling.
- **REQ-04**: A missing or malformed registry, or unreadable counters, refuses everything with a named reason. No fail-open.
- **REQ-05**: Ceilings are the owner's to set; the agents propose them with the observed baseline beside the documented limit.

## Success criteria

- **SC-001**: Zero quota errors from any vendor over 30 days after the flip to enforce.
- **SC-002**: Calls per vendor per day never exceed the ratified ceiling (read from the ledger, not asserted).
- **SC-003**: The 429 replay test shows a second process refusing within one second of the first process's report.

## What the case study teaches

A reactive backoff is not a budget. The registry is also the inventory: the first week of observe mode found two scripts nobody remembered that were calling a vendor every minute.
