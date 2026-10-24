---
name: grill-me
description: A relentless interview to sharpen a plan or design before building.
disable-model-invocation: true
---

# Grill Me

A user-invoked alignment tool. Reach for it on high-ambiguity work (a new
product/feature design, an architecture decision, a gnarly refactor) where the
cost of building the wrong thing is high. It does NOT fire on its own and is the
deliberate exception to `execute-don't-ask`: you invoke it precisely when you
want to be interrogated first.

Interview me relentlessly about every aspect of this plan until we reach a
shared understanding. Walk down each branch of the design tree, resolving
dependencies between decisions one-by-one. For each question, provide your
recommended answer.

Ask the questions one at a time, waiting for feedback on each before continuing.
Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase
instead of asking.
