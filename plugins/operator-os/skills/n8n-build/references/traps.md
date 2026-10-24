# Traps self-hosted n8n charges you for

**A "?" node means the build failed no matter what the API said.** The API stores unknown and excluded types silently. Only the canvas proves it. If you cannot see the canvas, say so; do not substitute a registry grep and state the conclusion the canvas would have given.

**An unset config key inherits a default that may not be empty.** See the exclusion-list note in the ground-truth file.

**`convertToFile` does not carry `$json` through.** A following read-file node with `fileName: "={{ $json.path }}"` resolves to `undefined` and throws. Reference the node that still holds the value: `={{ $('Earlier Node').first().json.path }}`.

**`writeContentToFile` does not create parent directories.** Writing into a new week's folder fails on the first run. Write into a directory that already exists.

**`$('Node').all()` inside a loop returns only the LAST iteration.** To grade a whole loop, read `$input.all()` on the `done` output; `splitInBatches` accumulates whatever is fed back into it. Getting this wrong silently grades 1 item and reports it as 41.

**A Code node cannot `fetch` or `require`.** Use the HTTP Request node or an LLM sub-node. Python Code nodes may not run at all on a self-hosted install; write JavaScript. A Code node cannot read credentials, so database I/O goes in the database node.

**`httpRequest` with `fullResponse` may put the text body in `data`, not `body`.** Reading `json.body` costs nothing at build time and reads as permanently empty at runtime: a first live run reported every source failed while every fetch had succeeded. Also: `onError: continueRegularOutput` wraps a non-2xx in an `{error}` shell and strips headers; to read headers or cookies off a 4xx, set `options.response.response.neverError: true` and branch on `statusCode`.

**The native local-model chat node cannot set `think: false` or `num_ctx`.** A thinking model's reasoning block destroys JSON parsing. If you need either, an HTTP Request to the local model's chat endpoint is a legitimate last resort; say why in a sticky note.

**Sticky notes overlap nodes** unless you place them well clear of the node rows. Put them at negative `y` above everything, and remember height extends downward.

**A source that answers HTTP 200 with zero entries is a FAILURE, not an empty week.** Record it as failed or the week silently shrinks.

**Ground LLM output against the input corpus.** Drop any item key the model invented before rendering. A key not in the corpus is a fabricated story.

**An ABSENT settings key is kept by the PUT.** Dropping `errorWorkflow` from `settings` and updating leaves the old id on the instance. Send `"errorWorkflow": ""` to clear it.

**Two handlers pointing at each other loop without bound.** n8n guards only direct self-reference. A handler's own `errorWorkflow` is empty.

**Poll triggers invoke the error workflow with no execution row.** Handler run counts exceed real failures; read the event log before inferring a cause.

**A localhost receiver URL in a production workflow is a question.** A workflow polling a dev server for days shows thousands of green runs of nothing. Name the process behind the port before trusting a success count.

**A node with On Error = Continue swallows the error and the execution is `success`.** No error workflow fires. A green execution does not mean it worked.

**n8n cannot tell a trigger that never fired from one that succeeded.** Add your own heartbeat check for scheduled work.
