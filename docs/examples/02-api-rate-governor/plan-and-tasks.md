# Plan and tasks: API rate governor

## Approach

1. Inventory every outbound vendor call by scanning for the client libraries and URLs. Each hit is a row candidate (a "seam census").
2. Write the registry with documented limits and the date each was read. Do not set ceilings yet.
3. Build `acquire()` with per-vendor counters, file locks, windows in the vendor's own reset timezone, spacing, and a per-run cap.
4. Run observe mode for several days. Read the incidents. Propose ceilings at a fraction of the documented limit with the baseline beside it.
5. The owner ratifies ceilings in writing; flip vendor by vendor to enforce.
6. Wire the 429 report so one process's limit hit arms a cooldown for all.

## Tasks

- [ ] Task 01 Seam census: every file that calls a vendor, with the lane that owns it
- [ ] Task 02 Registry rows for every vendor found, limits cited with URL and date
- [ ] Task 03 `acquire()` with locking, windows, spacing, per-run cap; unit tests including the double-spend race
- [ ] Task 04 Corrupt-state and missing-registry tests: both refuse with a named reason
- [ ] Task 05 Wire every seam through `acquire()`; census re-run reports zero ungoverned seams
- [ ] Task 06 Observe mode for 5 days; incident read-out
- [ ] Task 07 Ceiling proposal table (baseline, documented limit, proposed ceiling) for the owner
- [ ] Task 08 Flip to enforce, one vendor at a time, each with a rollback line
- [ ] Task 09 Handoff SOP: how the operations lead reads the ledger and adds a vendor

## Gates

- G1: no ungoverned seam. CHECK: the census. EXPECT: 0.
- G2: two processes cannot both take the last call. CHECK: the race test. EXPECT: exactly one succeeds.
- G3: a spent budget serves stale data with its age. CHECK: set a low ceiling, run the lane, open the screen. EXPECT: the stale label with an age.
