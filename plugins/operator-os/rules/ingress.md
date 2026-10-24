# Ingress: one front door, never a new hostname

Hostname sprawl causes drift and tech debt: every new subdomain is a new certificate, a new access policy, a new thing nobody remembers to retire.

1. **Machine traffic has one hostname, one hosting project, one database.** A new inbound integration (vendor post, webhook, widget, chatbot, voice, events) is a route under a versioned path such as `/api/v1/`, a table, a puller job, and a job-health row. Never a hostname, a project, a database, a tunnel or a secret store.
2. **A public name is the operator's to rule.** No spec, plan, script or config names a new host under a domain you own, or under a platform's shared domain, unless it is already in the registry. Present candidates with facts and stop.
3. **Human-facing surfaces are brand decisions**, few, and also registered.
4. **Vendors get one URL, permanently.** A contract change is a new versioned path, never a vendor edit.
5. **The census is the enforcement that survives the repo.** A hook can be edited off; a daily read of every hosting account and public DNS against the registry cannot. Live and unregistered, or registered and gone, is a red row, never a note.

## How it ships here

The ingress registry file ships empty. Add one row per approved hostname, with an owner and a reason. The write-time hook (`block-ingress-drift`) refuses a new hostname that is not in the registry; the census compares the registry to what is live.
