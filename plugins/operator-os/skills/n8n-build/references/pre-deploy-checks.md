# Static checks worth running before every deploy

- every `$('Node')` reference resolves to a real node name (match on the unescaped text: an ASCII-escaped character once read a valid reference as missing)
- every Code node passes a syntax check (wrap it in an async function and run `node --check`)
- no dangling connection targets, no unknown connection sources
- no node type on the exclusion list
- the workflow's own `errorWorkflow` points at a handler, and the handler's own `errorWorkflow` is empty

Your deploy script does the exclusion and readback checks. Run the rest from the builder.
