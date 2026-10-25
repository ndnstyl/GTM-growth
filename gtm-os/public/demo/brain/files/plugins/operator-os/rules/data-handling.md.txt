# Data Handling and AI-Boundary Rules

The one rule that protects client privilege, your IP and payment or personal data from the most common failure mode: sensitive data pasted into the wrong AI tool.

## Why this exists

In 2026 a federal court in New York held that documents run through a consumer AI platform were not protected by attorney-client privilege or work-product doctrine, and treated the material as discoverable. Which AI tool touched which data became a legal question, not a style preference. Any business that holds customer personal data, call recordings, colleague notes or proprietary systems has this exposure.

## Data classification tiers (classify before you touch)

| Tier | What | Examples |
|---|---|---|
| **T0 Privileged or regulated** | Legally protected or regulated | Cardholder data, health data, call recordings under two-party-consent exposure, anything under a confidentiality or data-processing agreement |
| **T1 Confidential or proprietary** | Trade secrets and client business data | Prompts, agent architecture, pricing and margin data, contact personal data, credentials, cost-spine landing folders and their receipts |
| **T2 Internal** | Non-sensitive operations | Drafts, ops notes, internal docs, public-derivable analysis |
| **T3 Public** | Already published or meant to be | Blog posts, shipped site copy |

## AI-tool routing matrix

| Tier | Consumer chat apps | Commercial API (no-train, short retention) | Governed pipeline (agreement, retention controls, access logging) |
|---|---|---|---|
| **T0** | **Never** | **Never**, unless under a signed agreement naming that exact processor | **Only path** |
| **T1** | **Never** | Allowed if the processor is on your approved register with no-train guaranteed | Preferred |
| **T2** | Avoid; strip identifiers | Allowed | Allowed |
| **T3** | Allowed | Allowed | Allowed |

**The bright line:** T0 and T1 data never enter a consumer chat interface. Not once. Sensitive work goes through a commercial API or a governed pipeline. A local model on your own hardware is the simplest governed pipeline.

## Hard rules

1. **Classify before processing.** If you cannot name the tier, treat it as T1.
2. **No T0 or T1 data in consumer AI tools, ever.** That includes client documents, prompts, pricing models and roadmaps pasted into a free chat UI.
3. **Recordings, transcripts and personal data stay in the governed lane.** Never route them through a tool not on the subprocessor register.
4. **Every external AI or data processor is on the subprocessor register** with a no-train attestation and agreement status before it touches T0 or T1 data. New processor means register first.
5. **Payment data is out of scope by design.** Payment flows never transit this machine or any AI pipeline. Any change is a deliberate, separate decision.
6. **Secrets are never printed, logged or sent to any AI tool.**
7. **When in doubt, gate to the operator.** Outbound disclosure of T0 or T1 data to a new destination is an approval, not a judgment call.
8. **Landing, export and consent folders are metadata only to a cloud agent**: column names, counts, dates, sizes and hashes, never a line. Line reads run on the local lane. The `block-local-zone-read` hook enforces this; a slip is recorded the same day.

## On your own IP

Protecting your IP before ink is signed is a rule, not a feeling. Client-facing material is T3 or sanitized T2. The build, the prompts, the agent architecture and the roadmap stay T1 and do not leave before contract. A paid pilot under contract is the protection. Before ink, share outputs, not mechanisms.
