# Ingress registry

One front door: machine traffic has one hostname, one hosting project and one database. A new inbound integration is a route under a versioned path, not a new subdomain. The registry lists every name you have approved; the `block-ingress-drift` hook refuses a write that mints a governed name that is not in it.

It ships EMPTY, and an empty `governed_domains` list turns the hook into a no-op that says so once.

## Configure

Copy the registry file from the plugin's `hooks` folder to `.operator/` in your project (same file name) and fill it in:

```json
{
  "governed_domains": ["example.com", "pages.dev"],
  "hostnames": [
    {"name": "api.example.com", "purpose": "the one machine front door", "owner": "you", "ruled_by": "you", "ruled_on": "2026-01-01"}
  ],
  "pages_projects": [{"name": "my-site"}],
  "workers": [],
  "tunnels": []
}
```

The apex domains in `governed_domains` are always allowed. Subdomains must be listed. A hosting project listed under `pages_projects` registers its default host on the shared hosting domain; a worker does the same on the workers domain.

## What the hook refuses

- A Write or Edit that adds a governed hostname that is not in the registry and not already in that file.
- A command that creates a hosting project, database, tunnel or public funnel.
- A shell redirect, `tee` or `sed -i` that puts an unregistered governed name into a file.

## The part that survives

A hook can be edited off. Pair it with a daily census that reads every hosting account and your public DNS and compares them with this registry. Live and unregistered, or registered and gone, is a red row, never a note.
