# Handoff SOP: every piece of work ships with the way someone else runs it

## The rule

1. **Work is not done until the person who owns the number can run the check.** Any analysis, audit, reconciliation or report produced for a colleague ships with a standard operating procedure in three parts, in this order:
   - **Part A, manual today:** what the owner does with the tools their seat already has: the screens by name, the exports, the exact prompt they type into their own workstation, the numbers to read and what each means. Written for the owner, not for you.
   - **Part B, the automation today:** what already runs, named in plain English by what it does, and how the owner asks for a run. **Part B never names a path on your machine**: no home-folder path, no repo-relative path, no script filename, no command to run. Two reasons: it exposes your machine to a reader who can never open the path, and your machine is not the company's corpus, so every path breaks the day you move hosts. What may travel: a shared-drive location the reader can open, a public URL, or a warehouse identifier. When the reader needs a receipt, give a prompt that retrieves it from the database. The `block-local-path-disclosure` hook enforces this.
   - **Part C, what is being built:** what the same check becomes once automated for every seat, each item named for what it is and its real status. No dates you have not set.
2. **The SOP travels with the deliverable.** When the finding goes out by email, the SOP goes as a second PDF on the same message and the body says so. The report answers "what happened"; the SOP answers "how you run this next time". One without the other is half a handoff.
3. **A walkthrough is scheduled, not offered.** The SOP's owner gets a screen share within the week, on their own machine, running Part A end to end. The date goes on the card.
4. **Every dependency the owner does not have is a named Coming Soon SOP**, each tracked as a card. An SOP that assumes an unwritten SOP is the gap it was meant to close.
5. **Training follows the SOP.** A repeatable check that a colleague seat will run becomes a proposed training module, proposed for the operator to ratify, never applied unilaterally.

## What counts as work that needs a handoff

Anything that leaves the harness for another person: a report, a reconciliation, an audit, a number read in a standing meeting, a fix to a vendor system, an answer that took a data pull to produce. The small-task fast lane still covers typo-class changes. It does not cover anything that produced a number someone else will act on.

## Mechanics

- Source markdown lives in an SOPs folder, named per your shell template, and is rendered to a branded PDF with a fingerprint. Unsigned means DRAFT in the version string and a blank sign-off block: it may travel for a walkthrough, it is not in effect.
- The card for the work logs three things: the SOP location, the walkthrough date, and the Coming Soon SOPs it named.

Why it matters: a handoff is complete when it raises no return question.
