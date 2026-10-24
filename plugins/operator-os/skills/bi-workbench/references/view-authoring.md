# View authoring: an agent turns a request into a saved view

A saved view stores a QUESTION, never numbers. No bespoke component code per request, ever.

## The flow

1. **Read the vocabulary**: the source registry lists sources, dimensions and measures (with the grain law and any platform gating). If the request needs a measure or dimension that does not exist, STOP: that is a registry change (reviewed, single-definition, parity-gated), never an inline expression.
2. **Compose the view JSON** against the view schema: an id (kebab-case), a name, a narrative (REQUIRED for canon views: the one or two sentence business translation the view ends with), the source key, rows, columns, measures, filters, date preset, an optional comparison (needs a period in rows), presentation, an origin of `"agent"`, and a created-by naming the agent and session.
3. **Validate** with the schema validator. Refusal reasons are exact: fix, never force.
4. **Land it** by writing the file into the views folder and adding its id to the folder's index. Canon views are git-tracked; commit by explicit path.
5. **Ship it**: a static export serves nothing until the deploy script runs. It also runs the tests, including the one that validates your file against the live registry.
6. **Tell the operator the view name.** They can hand-edit the JSON afterward, and a hand-edited view must still validate.

## Hard rules

- Percentages always travel with dollars. A percentage alone hides scale.
- With no prior-period baseline, show dollars only and label the comparison unavailable.
- Chart kind follows the question: trend over time is a line, parts of a whole is a stacked bar or a donut under five slices, comparison across categories is a sorted bar, relationship between two measures is a scatter.
