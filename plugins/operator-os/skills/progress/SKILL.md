---
name: progress
description: >
  Read-only "what's next" lookup. Reads the command board, the working queue and the priority
  ruling in the vault, then states the single next action with the priority reasoning shown: why
  it beats the other open items. Use when the operator asks "what's next", "what should I work on",
  "/progress", or wants a fast status check across the three board surfaces. Do NOT use to execute
  the item once named (that is `/goal`) and do NOT use to edit the board.
---

# /progress: single next-action lookup

A narrow router, not an executor. It answers one question: given the board, the queue and the priority ruling, what is the one thing to do next, and why does it beat everything else open right now. It never plans, executes or writes to the vault.

## Why this exists

"What's next" otherwise means checking three tabs by hand and reconciling them yourself. Three sources of truth for one question is a router problem; this skill is the router.

## Inputs (under `$OPERATOR_VAULT/00-BOARD/`)

- `NORTH-STAR.md`: the priority ruling. Read it FIRST. It names the current drop-everything items and the queue rule in force (for example "blockers and anything dated today or tomorrow at the top, then oldest first").
- `QUEUE.md`: the ordered working queue, split into lanes (agent work, chasing, operator gates) with gate markers for frozen or approval-blocked items.
- `_BOARD.md`: the live board view over the cards in `00-BOARD/cards/`. Use it to catch overdue cards the queue snapshot may not reflect yet, since the queue carries an `as_of` date and can lag.

If any of the three does not exist where expected, say so before falling back. Never silently substitute a different path. Run `init-vault.sh` to create a starter board if you have none.

## Procedure

1. Read the priority ruling. Note the stated queue rule and any drop-everything items (one or two by convention).
2. Read the queue. Note its `as_of` date and the top items, honoring the posted rule.
3. Read the board's overdue section to catch anything newer than the queue's `as_of`.
4. Reconcile: a drop-everything item outranks the queue unless it is itself blocked (an operator gate with no new input). In that case name the next unblocked item and say why the blocked one was skipped.
5. State ONE next action. Never return a list dressed as one item.

## Output format

```
NEXT ACTION: <plain-English task, not a ticket number>

WHY THIS ONE:
- vs. <next-closest item>: <one-line reason it loses: older but blocked, lower lane, gate not cleared>
- vs. <another candidate>: <one-line reason>
Source: priority ruling as_of <date> | queue as_of <date> | board overdue: <n items>
```

If the top-ranked item is an operator gate with nothing new to unblock it, say so and name the next actionable item instead. Do not report a stalled gate as the next action without flagging that it is stalled.

## Constraints

- Read-only. Never edits the board, queue, ruling or any card. Vault writes are main-loop-only.
- Never invents a ranking not traceable to the ruling's stated rule or the queue's lane and gate markers. The reasoning cites what is on the page.
- Not a substitute for `/goal`. This names the next action; `/goal` runs it.
- If the three files disagree, surface the conflict. Do not silently pick a side.

## Anti-patterns

- Returning a top-5 list when asked "what's next". That is the old problem, not the fix.
- Treating the queue's stale `as_of` date as current without checking the board for anything newer.
- Naming an action already flagged blocked as if it were actionable today.
