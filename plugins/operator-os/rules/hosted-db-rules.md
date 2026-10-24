---
paths:
  - "**/*database*"
  - "src/lib/**"
  - "src/pages/**"
description: Hosted-database patterns for static-export front ends
---

# Hosted Database Rules

1. **Client auth modules can hang on a static export.** Use a direct REST fetch with tokens held in localStorage for all critical operations.
2. **Use the vendor client for data queries**, but handle auth state manually via localStorage.
3. **Row-level security must be enabled** on all tables with user data.
