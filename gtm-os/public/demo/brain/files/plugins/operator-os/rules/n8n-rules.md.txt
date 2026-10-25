# n8n Rules

1. **Local workflow JSON is USELESS.** If it's not deployed to the live n8n instance, it doesn't exist. Always deploy via n8n API.
2. **TDD audit is mandatory** before every n8n deployment, schema-level checks.
3. **Never test workflows with Apify HTTP nodes**, tested manually by a human, never an agent.
3. **Humans test n8n workflows, never agents.** Default tester = the operator; for a workflow whose
   outcome a colleague owns, that owner tests, the operator activates.
4. **Patterns first**, never build from scratch, always start from existing patterns.
5. **ALWAYS use native n8n nodes**, HTTP Request only as last resort.
6. **Apify community node type**: `@apify/n8n-nodes-apify.apify` (NOT `n8n-nodes-base.apify`).
7. **CLONE working JSON, never author from prose.** Every node type+typeVersion must come from a
   known-working workflow on the SAME instance. The API accepts invalid node types silently, a
   "?" node in the UI means the build failed no matter what the API said.
8. **CANNOT FAIL SILENTLY.** One engine = one workflow (multiple trigger branches allowed). Gates,
   retries, and alerts INLINE: every failure branch ends in an alert/park node in the same canvas.
   External watchers are additions, never the primary catch.
