# Name the Thing: never an identifier (optional, enforced by a Stop hook)

> The rule: the operator never receives an identifier. Not a spec number, task id, gate letter, requirement code, finding code, phase, round, lane, step or decision number, ticket, hash, message id, or a codename invented during a session. Every reference to work says what the thing is and what it does, in plain English, in the sentence.
> Enforced by the `name-the-thing-stop-gate` hook, which you register only if you want the rule.

## The law

1. **No identifiers in prose the operator reads.** Chat replies, reports, board cards, emails, SOPs, PDFs, decks, commit subjects, and any subagent report the main loop relays.
2. **Every reference says what the thing is and what it does.** "The step where the register is written before the CRM post" is a reference. "T-101" is not.
3. **A file is named only by its full absolute path.** A path is how a file is found later; it is the one place an identifier may appear, because it is not the subject of the sentence.
4. **Identifiers live inside the kit files and fenced code blocks**, where the assistant keeps its own ledger. A subagent writes for the main loop; the main loop rewrites for the operator.
5. **Counts, money, dates, versions and percentages are not identifiers** and stay when they change what the reader does. A count of tasks done out of total is a status number nobody can act on; say what remains instead.
6. **No exception for brevity, tables or bullets.** A table cell reading "spec 122" is the same failure as a sentence that does. So is a bracket after the plain name.

## Why

A number is an index into a document the assistant has open and the reader does not. Using it as the subject outsources a lookup to the one person the harness exists to protect, and it fails silently: the token reads as a complete reference, so the reader has no signal they are missing something until they try to act on it. Numbers also collide across layers (spec, task, gate, decision, finding), and none of them is a ledger the reader works from.

## Swaps

| Never | Say instead |
|---|---|
| "T-101 is open" | "the register is not yet written before the CRM post; that wiring is open" |
| "spec 122 is at 78 of 94" | "the consent register is built and live; what remains is wiring it to the senders" |
| "G1 to G10 are your gates" | "the widget waits on your hosting steps, the copy approval and the security verdict" |
| "Phase 6 wiring" | "connecting the register to each lane that sends" |
| "(spec 176)" after a plain name | nothing; the plain name is the reference |

## Self-check before ending any reply

Read the final message once for any token that is letters plus digits, any "spec N", any kit word plus a number, any codename from this session. Replace each with what it is. The Stop hook refuses the turn otherwise, and the refusal costs the reader a second read of a near-identical message, which is the thing this rule exists to spare.
