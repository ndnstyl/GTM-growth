# Phase 1, Resolve the CLI

The argument can be anything natural: an API slug (`notion`), a brand
name (`cal.com`), an old CLI name (`notion-pp-cli`), or close enough
(`Allrecipes`). Resolve via the public library's `registry.json`, which carries `name`, `category`, `api`, `description`, and `path` for
every entry, in one fetch.

```bash
REGISTRY=$(mktemp)
gh api -H "Accept: application/vnd.github.v3.raw" \
  repos/mvanhorn/printing-press-library/contents/registry.json \
  > "$REGISTRY"
```

Match in this order:

1. **Exact `name` match**, `jq --arg q "$ARG" '.entries[] | select(.name == $q)' "$REGISTRY"`
2. **Normalized exact**, strip `-pp-cli` suffix, lowercase, dot→hyphen, then exact match
3. **Substring on `name` or `description`**, case-insensitive contains

```bash
# Exact:
jq --arg q "$ARG" '.entries[] | select(.name == $q)' "$REGISTRY"

# Normalized exact (after $ARG2 = lowercase, dot→hyphen, suffix-stripped):
jq --arg q "$ARG2" '.entries[] | select(.name == $q)' "$REGISTRY"

# Fuzzy (substring on name or description):
jq --arg q "$ARG2" '.entries[]
  | select((.name | ascii_downcase | contains($q | ascii_downcase))
        or (.description | ascii_downcase | contains($q | ascii_downcase)))
' "$REGISTRY"
```

If you get one match: use it. If multiple: present at most 4 to the user
via `AskUserQuestion` showing `name` + `description` per candidate. If
zero: tell the user the public library doesn't have that CLI.

The matched entry gives you everything you need:
- `LIB_PATH` from `.path` (e.g., `library/productivity/cal-com`)
- `API_SLUG` from `.name`
- `CATEGORY` from `.category`

**Don't slurp whole files** when reasoning over candidates. The fields
above are enough; if you genuinely need more, the per-CLI manifest is
just `<LIB_PATH>/manifest.json` and the description there can be pulled
the same way (`gh api -H "Accept: ... raw" .../manifest.json | jq -r '.description'`).
