---
name: contract-reviewer
description: Review SOWs, MSAs, NDAs and client contracts for red flags before signing. Flags scope creep, payment terms, IP assignment, termination, liability, indemnification and exclusivity issues against YOUR standard terms (set once in the terms block below). Use whenever a counterparty sends a contract or before sending one out.
triggers:
  - "review this contract"
  - "review this SOW"
  - "review this MSA"
  - "review this NDA"
  - "check this agreement"
  - "red flag this contract"
  - "contract review"
---

# Contract Reviewer

## What this skill does

Reads a contract (SOW, MSA, NDA, services agreement, consulting agreement) and returns a structured red-flag report keyed to the operator's actual exposure. Edit the "Standard terms" block once for your business; every redline suggestion defaults to it. This is a reading aid for a business owner, not a substitute for a lawyer's judgment on the clauses it flags.

## When to use

- A counterparty sends an MSA or SOW to sign.
- A new client sends a services agreement.
- You are drafting an outbound SOW and want a pre-flight check.
- An NDA arrives before a discovery call.

## Input

Paste the contract text into chat, or give a file path (PDF, DOCX, MD). Read PDFs with the Read tool. Convert DOCX with `pandoc` first.

## Review checklist (run all 8)

### 1. Scope
- Is the deliverable defined by **specific outputs** (artifacts, demos, milestones) or by **time and effort** (vague "services")?
- Are revision rounds capped? Default: 2 rounds; anything beyond is a change order.
- Is scope creep explicitly addressed with a change-order clause?
- **Red flag**: "as needed", "ongoing support", "best efforts" without caps.

### 2. Payment terms
- Net terms: 7, 15, 30, 60? Anything over net-30 is a red flag for a small operator.
- Deposit or upfront payment? Default: 50 percent for new clients.
- Late fees specified? (1.5 percent a month is common.)
- Kill fee if the client terminates? At least 25 percent of the remaining contract.
- **Red flag**: net-60 or longer, no deposit, no late fees, payment contingent on subjective client approval.

### 3. IP assignment
- Who owns the deliverable? Default: **the client owns final deliverables; you retain pre-existing IP, methods and tooling.**
- Are background IP and pre-existing materials carved out?
- Can you reuse anonymized learnings in case studies and marketing?
- **Red flag**: "work for hire" with no carve-out for tooling and methods; clauses that assign your pre-existing IP.

### 4. Termination
- Can either party terminate for convenience? With what notice?
- What happens to in-progress work and unpaid fees on termination?
- Are there termination penalties on you?
- **Red flag**: the client can terminate immediately without paying for work in progress; you carry unilateral obligations after termination.

### 5. Liability cap
- Is your liability capped? Default cap: **fees paid in the last 12 months** (or contract value, whichever is lower).
- Are consequential and indirect damages excluded?
- **Red flag**: unlimited liability; a cap higher than the fees received; no exclusion of consequential damages.

### 6. Indemnification
- Mutual or one-sided? Carve-outs for third-party IP claims?
- **Red flag**: you indemnify the client for "any and all claims" with no reciprocity; indemnification not capped at fees.

### 7. Exclusivity and non-compete
- Are you restricted from working with competitors? Geographic and time scope? Does it survive termination?
- **Red flag**: any exclusivity for a small operator; non-competes longer than 6 months after the engagement; vague "competitor" definitions.

### 8. Confidentiality and non-solicitation
- Mutual NDA built in or separate?
- Non-solicit of employees or contractors: reasonable duration?
- **Red flag**: non-solicit that applies to ALL of the client's contacts rather than people you actually worked with; duration over 12 months.

## Output format

```markdown
# Contract Review: <counterparty> <doc type>

## Summary
- **Verdict**: SIGN / NEGOTIATE / WALK
- **Top 3 issues**: <bullets>
- **Estimated negotiation effort**: low / medium / high

## Red Flags
| # | Section | Issue | Suggested Redline |
|---|---------|-------|-------------------|
| 1 | Payment | Net-60 terms | Change to net-15 with 50% deposit |

## Acceptable As-Is
- <clauses that are fine>

## Missing Clauses (should be added)
- <for example kill fee, change-order process, IP carve-out>

## Negotiation Script
> Thanks for sending this over. A few items I'd like to adjust before signing:
> 1. ...
```

## Standard terms (edit these once for your business)

- Net-15, 50 percent deposit for new clients
- 2 revision rounds; further work is a change order at an hourly rate
- Liability cap = fees paid in the last 12 months
- Mutual indemnification for IP claims
- No non-compete
- 14-day termination for convenience by either party; payment for work in progress required
- Client owns deliverables; you retain tooling, methods and anonymized learnings

## Output destination

Save the review to `projects/<project-slug>/contracts/review-<counterparty>-<YYYY-MM-DD>.md`. If unsure of the project slug, ask before writing.

## Anti-patterns (NEVER)

- Do not answer "consult a lawyer" as the whole answer. Surface the SPECIFIC clauses that warrant a lawyer's eyes versus those that are routine.
- Do not quote the entire contract back. Quote only the problematic clause, then explain.
- Do not recommend signing a contract you have not read fully.
