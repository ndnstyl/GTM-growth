---
type: constitution
status: template
---

# [Your Business] Constitution

**Version**: 1.0.0 | **Ratified**: [date] | **Owner**: [you]

The governance layer for your harness. Loaded at every session start (copy this file to `.specify/memory/constitution.md` in your project). Keep it short enough to be read every time and true enough to be obeyed. Delete any clause you will not enforce: an unenforced rule teaches the assistant that rules are optional.

## Identity

[Who you are and what this project is.] Three things are kept distinct:

- **Harness**: this repository, with its rules, hooks, skills, agents and spec kits.
- **Knowledge**: the vault, the canonical store for learnings and the status board.
- **Work**: project folders and the deliverables that leave this machine.

## MANDATORY: Plain English, never an identifier

Nothing the operator reads carries an identifier: not a spec number, a task id, a gate, a finding code, a phase, round or step number, a ticket, a hash, or a codename coined in a session. Every reference says what the thing is and what it does. A file is named only by its full absolute path. Identifiers live inside kit files and fenced code blocks. Optional enforcement: the `name-the-thing-stop-gate` hook. Rule: `rules/name-the-thing.md`.

## MANDATORY: The record is the board and the vault

If it is not on the status board or in the vault, it did not happen. Work status lives on dated, append-only cards. Learnings go to the vault continuously, not at session end (rule: learning-capture).

## MANDATORY: Spec kit before execution

No substantial work starts without a spec kit: `spec.md` (requirements), `plan.md` (approach), `tasks.md` (breakdown). Small tasks use the one-line queue lane in the agent-protocol rule, with an escalation trigger. Agents proceed autonomously on reversible work and stop only for destructive actions, outward sends, payments, production deploys, database migrations, workflow activation, and genuine scope changes.

## MANDATORY: Done means proven

Write the pass/fail ledger (gates file) before real work starts. Each gate has a command that goes red if it is not true, or a named measurement. An EVIDENCE line reading `pending` is an unmet gate. Nothing "rounds to done".

## MANDATORY: SOP gate

Every initiative, and every deliverable that leaves the harness for another person, ships with a standard operating procedure in three parts (manual today, automation today, what is being built), and the owner gets a scheduled walkthrough. Work without an SOP is incomplete. SOP source is markdown in git; the rendered PDF is the distribution copy. Rule: handoff-sop.

## MANDATORY: Loud-failure law

No silent failures, anywhere. Every failure path ends in a raised error that names what failed and what would fix it, a visible refused or held state, or an alert row in a surface someone watches. Every wait carries a deadline, because a blocked process looks identical to a working one. Liveness is units completed, never presence. A guard whose input never arrives cannot reject anything. Rule: loud-failure; enforcement: `block-silent-failure`.

## MANDATORY: Data handling and the AI boundary

T0 (regulated) and T1 (confidential) data never enter a consumer AI interface. Sensitive work goes through a commercial API with no-train terms, or a governed local lane. Every external processor is on the subprocessor register before it touches T0 or T1. When you cannot name the tier, treat it as T1. Rule: data-handling.

## MANDATORY: Outreach and compliance gate

Any work that creates, changes or scales an automated touch of a person (voice AI, SMS, dialer, a new lead source, a consent form, a channel crossover, recordings) passes the `opsec` agent before ship. Rule: opsec-gate.

## MANDATORY: Platform writes check with the owner

A call that writes outside this machine (CRM, ad platform, shared drive, email, hosting, workflow server) is denied until the owner mints a one-use approval. Local, revertible changes are checkpointed and made without asking. Enforcement: `platform-write-gate`. Doc: docs/platform-write-gate.md.

## MANDATORY: Vendor calls go through the governor

Every vendor API call routes through the API governor with a registry row and a ratified ceiling. No row, no call. A per-user-action vendor call needs its row before it ships.

## MANDATORY: One front door

Machine traffic has one hostname, one hosting project, one database. A new inbound integration is a route, not a hostname. A public name is the owner's to rule. Rule: ingress.

## MANDATORY: The warehouse is the source of truth for structured data

Every structured number comes from a deterministic query or view, one definition reused everywhere. An agent never hand-computes a figure and presents it as an answer. Numbers pass the accuracy hierarchy: research proves inputs, report computes and recomputes a second way, a senior pass ties out from a different pull. Rules: warehouse-first, bi-accuracy-hierarchy.

## MANDATORY: Credentials

Never print API keys, tokens or passwords. Use environment variables and the keychain. Never hardcode a secret in a tracked file. The pre-commit scanner and the CI secret scan are the mechanical layers; neither replaces not doing it. A token found in any git history is compromised: revoke and regenerate.

## MANDATORY: File-scope locking

Two agents must not modify the same file at once. Every spec kit declares `owned_paths`; check whether another active kit owns a file before changing it, and coordinate explicitly if it does. Releases happen when a kit completes.

## MANDATORY: Shared working tree

A tree several sessions share carries other sessions' uncommitted work. No agent runs rebase, pull, checkout, restore, stash, reset, clean, merge or add-all there. Explicit-path add and commit only. A dirty tree or conflict is reported, not resolved by rewriting the tree.

## MANDATORY: One spec kit per feature surface

If a feature needs several workstreams, they are phases within one kit. If duplicate kits cover one surface, stop and consolidate before resuming.

## Agents

List your agent seats here with tier and use. Thinking ceilings live in agent definitions, never in prompts. Every delegation starts with a task-type tag and states a budget. Vault writes are main-loop-only.

## Core principles

1. Hooks beat instructions: anything that must happen is a hook, not a paragraph.
2. Fork beats inline: complex work runs in an isolated subagent context.
3. Scalar metrics beat subjective judgment: agents need numbers.
4. Skill-first: every repeatable capability is a self-contained skill.
5. Progressive disclosure: load only what is needed.
6. Attribution over assertion: show the work.

## Shutdown checklist

```
- [ ] Status card updated for any work touched (append-only, dated)
- [ ] Learnings committed to the vault
- [ ] SOP written or updated if an initiative completed
- [ ] Deliverables at their documented absolute paths
- [ ] Session log written (automatic)
```
