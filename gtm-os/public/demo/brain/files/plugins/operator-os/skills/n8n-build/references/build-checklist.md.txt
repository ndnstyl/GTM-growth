# Build checklist: in order, no skipping

1. **Find the pattern first.** Check your templates, then the donor workflows on this instance, then any archive summaries. Never author from prose.
2. **Check every node type's outputs before wiring it.**
   - `splitInBatches` outputs are `['done','loop']`: connection index 0 is done, index 1 is loop. `if` is `['true','false']`.
   - Nodes with special inputs (an `agent` takes `main`, `ai_languageModel`, `ai_memory`, `ai_tool`, `ai_outputParser`) connect their sub-nodes on their OWN key, not `main`:
     ```json
     "Model": {"ai_languageModel": [[{"node":"Digest Writer","type":"ai_languageModel","index":0}]]}
     ```
3. **Check parameter names** against a donor or the compiled node under the installed package's `dist/nodes/<Name>/`. Guessing a parameter name is how you ship a node that stores fine and fails at runtime.
4. **Generate the workflow from a script**, never hand-edit JSON. If the workflow embeds a config file's contents, generate it from that file so the two cannot drift.
5. **Deploy with a deploy script** that runs the exclusion check, the round-trip readback (settings, wiring and the active flag, not just a count of connections), and prints the URL. It refuses excluded types.
6. **Deploy INACTIVE. A human tests; the operator activates.** Never run a workflow yourself to "check it works". Say plainly which verification you could not perform.
7. **Every failure branch ends in an alert node in the same canvas**, plus an error workflow for hard crashes.
