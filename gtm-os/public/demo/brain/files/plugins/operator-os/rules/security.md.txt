---
paths:
  - "src/**"
  - "**/*auth*"
  - "**/*database*"
  - "**/*api*"
  - "**/*.env*"
  - "scripts/**"
description: Security rules, secrets, row-level security, audit requirements
---

# Security Rules

1. **NEVER print API keys, tokens, or passwords in console output.** Use env vars.
2. **A test or audit pass is mandatory** before every workflow-automation deployment, schema-level checks.
3. **Always check for existing data** before database migrations.
4. **Row-level security** must be enabled on all tables with user data.
5. **Static export constraints**: client auth modules can hang on a static export. Use a direct REST fetch with localStorage tokens.
6. **Never rewrite a working tree.** No `git rebase`, `pull`, `checkout`, `restore`, `stash`, `reset`, `clean`, `merge` or `add -A` in a tree that carries other sessions' uncommitted work. Explicit-path `add` + explicit-path `commit` only; a bare `git commit` ships whatever another session has staged.
7. **A per-user-action vendor call needs a named budget before it ships.** Any feature that would fire a vendor API call per user action (page load, click, filter, search) routes through a rate governor with its own registry entry, an agreed ceiling, and a named lane FIRST. Viewer surfaces read centrally rendered artifacts, never vendors. No registry entry = do not ship.
