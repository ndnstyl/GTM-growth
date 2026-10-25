# Retrieval Trust Layer: the knowledge ladder and the loud miss (case study: Harbor & Pine Home Services)

**Status**: Built | **Created**: 2026-06-08 | **Owner**: Dana Ortiz (fictional)
**Input**: "If I know how to use this and I am hitting hard walls between retrieval and context I know is in there, I cannot fathom a new user with no idea what is in the corpus. That is the difference between a useful tool and one that gets ignored over time. It needs to be fast, seamless and most of all accurate."

## The problem in one paragraph

An hour of planning a hosting consolidation ran without anyone knowing the company does not hold title to its main domain, a fact recorded in nearly 500 notes since the spring. The company had a mature governance ladder for what an agent may DO (tiers, a policy layer, pre and post hooks, an audit trail) and nothing equivalent for what an agent may KNOW. Retrieval failed silently: a query that found nothing and a query never run looked identical to the reader, an answer with no mention of the knowledge base at all.

## The thesis

Build the knowledge-side mirror of the action-side ladder, in the same shape, so one mental model covers both.

1. **Cheapest and most deterministic first, escalate only on a miss.** Tier 0: facts already in context. Tier 1: an index lookup. Tier 2: a ranked search of the whole corpus. Tier 3: the raw source. Never start at the expensive end, and never skip a tier silently.
2. **A policy layer between the question and the corpus**: who is asking (seat scope), how sensitive the note is (data tier), and what the answer is allowed to say (answer policy).
3. **Retrieval is involuntary.** A prompt-submit hook searches the vault on every domain change and puts the top titles in context, so the agent does not need to suspect an answer exists before it looks.

## User stories

### Story 1: The agent finds a recorded fact without being asked to look (P1)

**Independent test**: ask about the domain-title question in a fresh session with no hint; the recalled titles include the note that records it.

### Story 2: A miss is loud (P1)

When retrieval returns nothing, the answer says the corpus was searched, with what, and found nothing. "I searched for X and Y in the knowledge base and found no note" is a result; silence is not.

**Independent test**: ask about an invented fact; the reply states the search and the empty result instead of improvising.

### Story 3: A note that contradicts another is surfaced, not overwritten (P2)

Two notes that disagree are shown together with their dates; the newer does not silently win.

### Story 4: A new user can see what the corpus holds (P2)

A map per area lists the notes by claim title, so a user with no idea what exists can browse.

## Requirements

- **REQ-01**: Recall runs on every prompt-submit and every subagent start (subagents start memory-blind otherwise).
- **REQ-02**: Each answer records which tier produced it.
- **REQ-03**: Every recalled note shows its date and a verified-on stamp when its fact is volatile.
- **REQ-04**: Retrieval failures (index missing, service down, timeout) raise a named error and never degrade to "no results".

## Success criteria

- **SC-001**: On a set of 50 questions whose answers are known to be in the corpus, at least 90 percent surface the right note in the first five titles.
- **SC-002**: On 20 questions whose answers are not in the corpus, 100 percent of replies state that the search found nothing.
- **SC-003**: Zero retrieval-service failures read as an empty result in a month of logs.

## What the case study teaches

Two numbers matter: how often the right note is found without being asked for, and how often a miss is announced. The second one builds trust faster than the first, because a user who sees the system say "I looked and it is not there" believes it when it says it found something.
