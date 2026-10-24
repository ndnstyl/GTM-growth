## Freshness fields on volatile facts

When a source yields a fact that can silently age (access states, vendor
configs, pricing, org claims, API behavior), add to the new/updated note's
frontmatter:

```yaml
metadata:
  verified: YYYY-MM-DD      # when the fact was last confirmed against reality
  refresh_due: YYYY-MM-DD   # when it must be re-verified before being cited
```

`vault-lint.py` flags overdue `refresh_due` dates as CRITICAL. Evergreen
patterns need no freshness fields, use them only where staleness has a cost.
