# Worked examples: seven spec kits as case studies

Each folder is a real kind of spec kit (`spec.md` plus a combined plan and task list), rewritten around a fictional company so you can see how the harness's own rules were produced and what a good kit looks like. **Every company, person and number here is invented; the failure patterns are real.** The hard-won rules are real too.

The fictional company is Harbor & Pine Home Services: 40 employees, two metro areas, a small call center, a CRM, three ad platforms and an operator (the owner) who runs the business with AI agents.

| Example | The problem it solves | The rule it produced |
|---|---|---|
| `01-harness-autonomy` | The agent asked the owner a question on every write | One approval per goal, keyed on the tool's invocation, not on words in a command |
| `02-api-rate-governor` | One loop spent a vendor's whole daily quota | One registry and one gate in front of every vendor call; budgets set well under the vendor's number |
| `03-loud-failure` | A job sat "running" for an hour doing nothing | Every failure path ends in an error, a visible refusal, or an alert row; every wait has a deadline |
| `04-retrieval-trust` | The agent did not know what the knowledge base knew, and said nothing about it | A knowledge ladder and the loud miss: a search that finds nothing says so |
| `05-version-control-and-ci` | Finished work sat uncommitted and the backup drive did the history job | A trunk, tagged releases, and two seats that keep it current and green |
| `06-vault-naming` | 1,700 notes named like database rows | Rename for a human, with a checkpoint, aliases, rewritten links and an auto-rollback gate |
| `07-self-healing` | Health checks notified but never fixed anything | Deterministic remedies bound to health signals, each with preconditions, a lock, a verify and a reversal |

How to read a kit: start at the first paragraph of `spec.md` (the problem in one paragraph), skim the user stories, then read the requirements and the success criteria. `plan-and-tasks.md` shows how the work was cut into verifiable steps. Notice that every story has an independent test and every failure path has a named end.
