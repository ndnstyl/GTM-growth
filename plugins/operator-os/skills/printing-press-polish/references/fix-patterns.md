# Fix Patterns (Cross-Cutting, Any Priority)

### Runtime variant default checklist

If a polish fix adds or changes a runtime mode, data-source option, auth tier, transport, or other user-visible default, document this short checklist before selecting the default:

- **User-visible default:** which behavior users get without extra flags or config.
- **Compatibility risk:** whether existing commands, scripts, MCP tools, or stored config change behavior.
- **Verification command:** the exact command that proves the default and the non-default escape hatch both work.

Keep the checklist in the polish notes or result block. Skip it for ordinary bug fixes that do not change runtime variants or defaults.

### Cross-cutting API-call instrumentation

When polish builds a feature class that must observe every outbound API call,
such as a quota ledger, request log, or audit trail, instrument the generated
client middleware in `internal/client/client.go` instead of individual command
handlers. Prefer a shared pre-dispatch hook when one exists; otherwise cover
both `do()` and `doRead()`. The `do()` path handles standard endpoint mirrors,
sync iterations, and novel features that use the generated client, while
`doRead()` handles read-only operations that ride POST-like transports, such as
GraphQL queries, JSON-RPC reads, and POST-based searches marked
`mcp:read-only`.
Per-command hooks under-count because they only see the commands polish touched.

### Novel-feature data routing

When polish adds or fixes a novel command that reads API response data into the
local store, route data through the generated typed schemas instead of writing
raw response JSON directly into tables:

1. Read `internal/types/<resource>.go` and `internal/store/<resource>.go` for the
   resource being cached. Use the typed insert/upsert helpers those files emit
   whenever they exist. If helpers are missing for a generated resource, create
   them before writing any persistence code.
2. Check the response shape against the spec schema and a real sample response
   before deciding the insert mapping is correct.
3. Decode the API response into the typed struct before persistence. Do not
   build `INSERT INTO ...` statements from untyped `map[string]any` or raw
   `json.RawMessage` values unless the table is a custom polish-owned table
   declared in hand-authored migrations; see the raw SQL exception below.
4. Verify the target table from the resource type, not from whichever query the
   novel command happened to start with. A command that fetched `<child>`
   records must insert `<child>` rows, not parent rows or a convenient adjacent
   table.
5. Normalize nested response identifiers before insert. If the API wraps the
   scalar id inside an object that also contains metadata, extract the scalar id
   field and store that value; never store the whole id object as a primary key
   or foreign-key reference.

Raw `database/sql` writes are acceptable only for custom polish-owned tables
declared in hand-authored migrations. In that case, keep the table schema
explicit in `internal/store/`, document why the generated resource helper does
not apply, and still decode nested identifiers to scalars before persistence.

