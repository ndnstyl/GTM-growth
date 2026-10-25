---
description: How the call center returns a missed call within thirty minutes and logs the attempt.
type: sop
---
# SOP: Missed Call Callback

**Owner:** Sam · **Cadence:** every open hour · **Draft, unsigned**

## Part A: by hand today
1. Open the missed-call list from the phone system.
2. Call back within thirty minutes ([[Missed Call Callback Window]]).
3. On answer, read the phone number back before offering a slot ([[A Booked Job Is Not a Lead Until the Phone Number Is Confirmed]]).
4. Log the attempt: answered, voicemail, or no pickup. A call with no log row is a defect.

## Part B: what the assistant does today
Ask: "List missed calls older than twenty minutes with no callback logged." It prints the list with the count and the basis; a list of zero says which export it read.

## Part C: being built
An alert when the oldest unreturned call passes twenty-five minutes. Status: designed, not built.
