## Example invocation

```
the operator: /synthesize last month
Claude: [scans 23 pages from last 30 days across the vault]
        [clusters by entity, concept, semantic similarity]
        [surfaces 8 candidate patterns]

        ## /synthesize report, 2026-08-15, scope: last 30 days

        ### HIGH leverage
        - "Interlayer adhesion" appears in 7 call transcripts as a customer concern
          → Create `wiki/chemistry/chemistry_interlayer_adhesion_objection.md` rebuttal page
        - Meta CPL drifted from $58 (June) to $74 (August) on regional campaigns
          → Investigate; likely related to seasonal competition
        - 4 lost-lead interviews cited "financing was the issue" but never specified rate
          → Sales should benchmark vs competitors

        ### MEDIUM leverage
        - 3 customers mentioned competitor "Penntek", promote to org entity page
        - "Lifetime warranty" appears with subtle wording variations across pages, needs standardization

        ### Contradictions
        - Set-to-show rate: Sales GM says 55%, CRM export says 47%, which is current?

        ### Missing entities
        - "the account manager's cousin Tony" mentioned in 4 install ops conversations, relevant?

        Approve actions? (interlayer page + Penntek entity + warranty standardization)

the operator: yes interlayer + Penntek, skip warranty for now, escalate set-to-show contradiction to CFO
Claude: [creates interlayer chemistry page, creates Penntek entity, appends log entry, drafts Slack message to CFO]
```
