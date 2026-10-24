## Example invocation

```
User: /ingest ~/Downloads/vendor-call-transcript-2026-06-08.md
Claude: [locate-save-source: saves to raw/transcript-vendor-kickoff-call_2026-06-08.md]
        [read-full: reads full transcript]
        [decide-shape: settles shape + takeaways, carries them to the report, does NOT stop]
        [write-summary: writes wiki/sources/transcript-vendor-kickoff-call_2026-06-08.md]
        [update-pages: updates person_jane_doe.md, org_acme_corp.md, project_acme_onboarding.md]
        [update-index: updates index.md]
        [log-entry: appends log.md entry]
        [report: reports "5 pages updated, 1 new entity (person_acme_account_lead), 2 unresolved wikilinks waiting for ingest of [next source]"]
```
