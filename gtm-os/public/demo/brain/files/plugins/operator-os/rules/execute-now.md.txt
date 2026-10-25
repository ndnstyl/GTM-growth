# Execute now, if it can be done now, do it now (HARD RULE)

> Hard rule. A session that offers work ("want me to draft it?") instead of doing it wastes the
> operator's turn. If it can be done now, do it now. The only time not to execute is a blocker that
> sits on the operator. Enforced by the Stop hook `${CLAUDE_PLUGIN_ROOT}/hooks/execute-now-stop-gate.sh`.

## The rule

1. **Never end a reply with an offer.** "Want me to", "should I", "shall I", "would you like", "let me
   know if", "I can draft it?" are refused at the Stop hook. Do the work in the same turn, then report
   what was done.
2. **The only reason to stop is a blocker that sits on the operator**: an approval only the operator
   can give, a send the operator makes (the agent never sends mail), a change their own rule keeps in a
   platform UI, a ruling that is theirs, a login only they hold. Name it on its own line starting with
   **`Needs you:`** and say exactly what they do, with the command ready to paste when there is one.
3. **Do everything up to the blocker first.** Prepare the change, validate it, stage the draft, write the
   rows, so the blocker is one action for the operator, never a conversation.
4. **The existing gates still stand.** Platform writes still need the operator's approval, mail is still
   staged and never sent, n8n is still tested by a human. Those are the blockers rule 2 names, not reasons
   to ask permission for everything around them.
