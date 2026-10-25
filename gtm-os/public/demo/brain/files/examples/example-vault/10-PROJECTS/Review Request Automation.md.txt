---
description: Project to ask every finished job for a review within a day and stop the ask on any complaint.
type: project
---
# Review Request Automation

**Goal:** every finished job gets one polite review request within 24 hours, and no unhappy customer gets one.

## How it works
1. The scheduling software marks a job complete ([[Vendor Terms Summary, Scheduling Software]] says what the export contains).
2. A daily job lists yesterday's completed jobs with no open complaint.
3. A draft message is staged for each; Priya reads the batch and sends. The agent never sends to a customer.
4. Any reply that sounds like a complaint goes to Sam the same day ([[SOP-Missed Call Callback]] has the same hand-off shape).

## Failure paths
A job with no phone number is listed in the morning report as "not asked, no number", never skipped quietly ([[Loud Failure Means a Silent Job Is a Bug]]).

## Status
Building. Next: test on ten finished jobs. Card: [[_BOARD]].
