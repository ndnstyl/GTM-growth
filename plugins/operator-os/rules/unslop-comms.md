# Unslop, every communication, every surface

> Unslop is a property of ALL communication in this harness, not a publishing filter: chat/CLI
> replies, subagent reports, status cards, commit messages, docs, drafts.
> **The chat Stop hook ships but is not registered by default.** It blocks the turn on a violation,
> which forces the whole final message to be regenerated, so the reader pays output tokens twice.
> It lives at `${CLAUDE_PLUGIN_ROOT}/hooks/unslop-stop-gate.sh`; to enable it, add it under
> `hooks.Stop` in your own settings.
>
> **These rules still bind.** They are followed, not enforced on chat. Gates that cost nothing
> (a send tool that refuses a banlist hit at the tool) are the right shape: no regeneration, no
> double spend.

## In chat and reports, digestibility outranks completeness

1. **Plain words first.** Technical terms only where they change what the reader
   does next. If a sentence works without the term, the term goes.
2. **The reader is catching up, not replaying.** No codenames or shorthand you
   invented mid-session without a plain-language anchor. Say what you mean in place.
3. **Short is a token budget, not a style.** Cut detail that does not change the
   reader's next move; never compress into fragments or jargon chains to fake brevity.
4. **Verdict before mechanism.** Lead with what happened or what it costs; the how
   is below for whoever wants it.
5. **No AI tells in your own prose.** The unslop.md pattern tables apply to chat
   verbatim: no puffery, no vague attributions, no fancy "is", no decorative
   triplets, no em dashes. Quoted/reproduced text is exempt, never rewrite a quote.
6. **Attribute numbers to the data, not to the tool.** Where a number came from is "our database" or
   "the data"; internal product codenames stay out of anything a colleague reads.
7. **Self-audit before ending any substantive reply:** "What makes this obviously
   AI generated?" Fix what you find.

Subagents: this file loads with the project rules; write your reports to it, and
the main loop rewrites any agent output it relays.
