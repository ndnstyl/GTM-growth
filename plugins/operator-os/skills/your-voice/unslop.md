# Unslop: cut AI tells, then add soul

> Adapted from Matt Pocock's `unslop` skill (MIT, https://github.com/mattpocock/skills), tailored to this plugin. Applies to EVERY register. The banlist file regex-enforces the mechanical subset; this file carries the judgment subset a regex cannot catch, plus the half a banlist never has: adding soul.
>
> Order of authority: your measured corpus fingerprint wins over any rule here. This file removes the model; your corpus adds you.

## Process (runs inside every humanize pass)

1. Scan for the patterns below (the banlist pass catches its subset automatically).
2. Rewrite. Preserve meaning, match the register's tone.
3. Add soul (next section).
4. Self-audit: ask "**What makes this obviously AI generated?**" and fix the remaining tells. This question is the whole trick. Ask it once per draft, out loud, before scoring.

## Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as obvious.

- **Have opinions.** React to facts instead of neutrally listing pros and cons. Say what the number means, not that it "is interesting".
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Measure yours: uniform sentence and block length is a tell.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive". Give ground, then push.
- **Use "I" when it fits.** First person is not unprofessional.
- **Let some mess in.** Perfect structure looks machine-made. Do not sand real roughness smooth.
- **Be specific.** Not "this is concerning" but the date and the figure. Specifics are the argument.

## Patterns to detect and fix

Enforcement: **regex** means the banlist catches it; **judgment** means you catch it in the rewrite pass.

### Content

| # | Pattern | Fix | Enforcement |
|---|---|---|---|
| 1 | **Puffery.** "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted" | Cut the puff, state what happened | regex |
| 2 | **Name-dropping.** Listing outlets or sources without context | Pick one, say what was said | judgment |
| 3 | **Superficial -ing phrases.** ", highlighting...", ", ensuring...", ", reflecting...", ", showcasing...", ", fostering..." | Delete, or expand with a real source | regex |
| 4 | **Promotional language.** "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning" | Neutral description | regex |
| 5 | **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue" | Name the source or delete. A claim without a receipt is an opinion | regex |
| 6 | **Formulaic challenges.** "Despite challenges... continues to thrive" | Replace with specific facts | regex |

### Language

| # | Pattern | Fix | Enforcement |
|---|---|---|---|
| 7 | **AI vocabulary.** additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant | Plain words | regex |
| 8 | **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features" | Just say "is" or "has" | regex |
| 9 | **"Not just X, but Y."** | State the point directly. (Distinct from a correction like "the margin is $29, not $71", which is a legitimate construction: never strip a correction while hunting the tell.) | regex |
| 10 | **Rule of three.** Forcing ideas into groups of three | Use the natural number | regex flag |
| 11 | **Synonym cycling.** "protagonist, main character, central figure, hero" in one paragraph | Pick one word, repeat it | judgment |
| 12 | **False ranges.** "from X to Y" where X and Y are not on a meaningful scale | List the topics directly | judgment |
| 13 | **Em dashes** used as a rhythm crutch | A period, comma, colon or parentheses | regex |

## Structure tells (judgment)

- Every paragraph the same length.
- A summary sentence that restates the paragraph it ends.
- A closing offer ("let me know if...", "I hope this helps").
- Headings on a message that is three paragraphs long.
- Bold on every other phrase.
