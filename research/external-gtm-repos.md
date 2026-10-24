# External GTM-as-agents repos: survey and stage taxonomy

Date: 2026-10-24. Method: 9 web searches and 17 page fetches (public GitHub pages and search results only; nothing cloned or run). Star counts are given only where a repo page showed them on 2026-10-24; several pages contradicted themselves (noted). "Search-only" means the repo appeared in search results but its page was not opened.

## 1. Repo table

Stage codes: R research, P positioning/strategy, L list/lead build, O outbound/outreach, C content, S SEO/AEO, A paid ads, X conversion/experiments, Q qualify/route/CRM, M measurement/attribution, T retention/lifecycle.

| # | Name | URL | Category | Stages | What it does |
|---|---|---|---|---|---|
| 1 | coreyhaines31/marketingskills (56.3k stars) | https://github.com/coreyhaines31/marketingskills | skills | P C S A X M T Q | 52 markdown skills; a product-marketing skill is read first by all others. Categories: CRO, copy, SEO, paid, measurement, retention, growth engineering, RevOps. |
| 2 | gooseworks-ai/goose-skills (1.3k) | https://github.com/athina-ai/goose-skills (redirects to gooseworks-ai/goose-skills) | skills | R L O C S A | 200+ skills in `skills/`, each with SKILL.md plus meta JSON. Categories: ads, SEO, lead gen, outreach, content, research, competitive intel, monitoring, social, brand. A brand-growth collection runs Research, Analyze, Create, Learn. |
| 3 | alirezarezvani/claude-skills (28.6k; README says 5.2k) | https://github.com/alirezarezvani/claude-skills | skills | P C S X A Q | About 398 skills in 20 domain folders. Marketing is 8 pods (content, SEO+AEO, CRO, channels, growth, intelligence, sales). Commercial folder has deal-desk and forecasting. |
| 4 | gtmagents/gtm-agents (428) | https://github.com/gtmagents/gtm-agents | agents | all | Plugin per GTM function (sales, marketing, growth, analytics, orchestration); each plugin has agents/, commands/, skills/. Page counts disagree (67 plugins vs 75 listed). |
| 5 | thatrebeccarae/claude-marketing (177) | https://github.com/thatrebeccarae/claude-marketing | skills, agents, loops | A S C X M T | 56 skills (paid media 9, SEO 6, content 6, analytics 5, email 3), 3 agents, and a daily n8n GA4-to-tag-manager pipeline. |
| 6 | manojbajaj95/claude-gtm-plugin (108) | https://github.com/manojbajaj95/claude-gtm-plugin | skills | P S C O Q M A | 54 flat skills; a bootstrap skill interviews you once for brand, audience, voice, channels, cadence, metrics. |
| 7 | sidchaudhary/gtm-skills (Intempt; 4) | https://github.com/sidchaudhary/gtm-skills | skills, loops | L O Q X T M A | Organized by job role (SDR, AE, GTM engineer, lifecycle, experimentation, data analyst, performance marketer) rather than tool. Adds scheduled "store automation" checks that propose and wait for approval. Counts inconsistent (78/90). |
| 8 | ericosiu/ai-marketing-skills (3.7k) | https://github.com/ericosiu/ai-marketing-skills | skills, loops | O C S X M | 29 skill folders, each with scripts and scoring. Growth Engine (autonomous experiments), Outbound Engine, Revenue Intelligence (call insights and attribution), PII sanitizer and pre-commit hook. |
| 9 | LaGrowthMachine/gtm-system (45) | https://github.com/lagrowthmachine/gtm-system | skills, MCP | L O Q M | Groups: fuel pipeline, get meetings, catch opportunities, secure channels (deliverability, "coming soon"). Vendor-tied hosted MCP. |
| 10 | sachacoldiq/ColdIQ-s-GTM-Skills (306) | https://github.com/sachacoldiq/ColdIQ-s-GTM-Skills | skills | L O A | 6 master orchestrators (cold email, LinkedIn ads/content, list building, n8n, signal sourcer) plus 31 standalone skills. |
| 11 | TheCraigHewitt/seomachine (about 7.5k) | https://github.com/TheCraigHewitt/seomachine | agents, skills | R S C X | Claude Code workspace: /research, /write, /optimize, /publish-draft, landing-page commands, 10 agents, content folders from topics/ to review-required/ to published/, GA/GSC/DataForSEO inputs. |
| 12 | karpathy/autoresearch (about 98.5k) | https://github.com/karpathy/autoresearch | loop | X (pattern) | Agent edits one file, runs a fixed 5-minute trial, keeps or reverts on a single metric; program.md holds the instructions. Not marketing, but the base of every "autonomous growth loop" write-up (e.g. https://www.mindstudio.ai/blog/autonomous-marketing-optimization-agent-autoresearch-loop). |
| 13 | kaymen99/sales-outreach-automation-langgraph (405) | https://github.com/kaymen99/sales-outreach-automation-langgraph | agents | R Q O | LangGraph: fetch leads from CRM, research, score, draft outreach report and email, write back to CRM. |
| 14 | crewAIInc/crewAI-examples (6.2k; archived 2026-04-20) | https://github.com/crewAIInc/crewAI-examples | agents | P C Q | Marketing Strategy crew, Instagram Post crew, Landing Page Generator, Lead Score Flow (human review), Content Creator Flow. |
| 15 | enescingoz/awesome-n8n-templates (26.1k; page also says 19k) | https://github.com/enescingoz/awesome-n8n-templates | automations | L O Q C | Folders by integration (Gmail, Sheets, WhatsApp, Airtable...), not by stage. Lead qualification, cold email, scoring, blog generation. Page discloses referral commissions. |
| 16 | VoltAgent/awesome-agent-skills (36.3k) | https://github.com/VoltAgent/awesome-agent-skills | awesome list | index | Curated directory of 1,000+ skills by vendor; not GTM specific, a place to find more. |
| 17 | pipeboard-co/meta-ads-mcp (1.3k) | https://github.com/pipeboard-co/meta-ads-mcp | automations (MCP) | A M | Hosted MCP that reads and writes Meta ads; new objects default to PAUSED, writes need explicit confirmation. |
| 18 | googleads/google-ads-mcp (about 1.1k) | https://github.com/googleads/google-ads-mcp | automations (MCP) | A M | Google's official server; three tools (search by GAQL, resource metadata, list customers), appears read-only (page does not say outright). |
| 19 | agenticty/agentflow | https://github.com/agenticty/agentflow | agents | R Q O | Research, qualify (ICP), outreach agents. Search-only; framework not confirmed. |
| 20 | piyushxbhardwaj/amosflowai | https://awesome.ecosyste.ms/projects/github.com%2Fpiyushxbhardwaj%2Famosflowai | agents | R O Q | LangGraph, FastAPI, Streamlit GTM system; enrichment, outreach, CRM tracking, follow-up. Search-only, reported 0 stars. |
| 21 | github/awesome-copilot (gtm-ai-gtm skill) | https://claudemarketplaces.com/skills/github/awesome-copilot/gtm-ai-gtm | skills | P | Skill for selling AI products to enterprises. Search-only. |
| 22 | mbfinotti/revops-skills | https://www.claudemarket.ai/skills/mbfinotti/revops-skills/revops-radar | skills | M (RevOps) | revops-radar builds a watch list of RevOps information sources. Search-only. |
| 23 | HubSpot Agent CLI skills | https://knowledge.hubspot.com/integrations/use-the-hubspot-agent-cli | skills (vendor) | Q M | Vendor skills for CRM search, bulk ops, data quality, workflows, reporting. Repo URL not seen. |
| 24 | Content-Agent-Kit | https://dev.to/xuhoit/building-a-real-content-pipeline-for-ai-agents-not-just-another-chatbot-wrapper-4j8c | loop | C | Stateful content pipeline with a real review step (blog post; repo URL not seen). |
| 25 | Composio multi-agent SDR (CrewAI) | https://composio.dev/blog/ai-agent-gtm-integrations-guide | agents (tutorial) | O Q | Gmail and LinkedIn SDR crew via Composio; vendor tutorial, not a standalone repo. |
| 26 | LangChain internal GTM agent (case study) | https://www.zenml.io/llmops-database/building-a-multi-agent-gtm-system-for-sales-automation | agents (case study) | R Q O | New Salesforce lead triggers research, email draft, Slack approval. Closed source; vendor-reported results. |
| 27 | affaan-m/ECC customer-billing-ops | https://github.com/affaan-m/ECC/blob/main/skills/customer-billing-ops/SKILL.md | skills | T | Stripe refund and churn triage with guardrails. Taken from an internal note from a 2026-06-16 scrape; not re-checked today. |
| 28 | wrsmith108/stripe-mcp-skill | https://github.com/wrsmith108/stripe-mcp-skill | skills (MCP) | T | Claude to Stripe via MCP. Same vault source, not re-checked. |

Also seen in search only, no GitHub URL captured: Synter-Media-AI MCP server (multi-platform ad management), a Google+Meta+GA4 community MCP with 250+ tools, johnoconnor0/google-ads-mcp, attainmentlabs meta-ads MCP. Directory pages: https://enterprisedna.co/directories/mcp/synter-media-ai-mcp-server, https://glama.ai/mcp/servers/attainmentlabs/meta-ads-mcp.

## 2. Stage taxonomy the field converges on

Ordered. No repo uses exactly this list; it is the common ordering across the group-by-job and group-by-funnel repos above.

1. **Context and positioning.** Brand, ICP, voice, offer, competitors. Nearly every large pack starts with a foundation skill that everything else reads: marketingskills (1), claude-gtm-plugin bootstrap (6), seomachine `context/` (11), gtm-agents (4), alirezarezvani (3).
2. **Market and competitor research.** Company, market, SERP, competitor and signal research: goose-skills (2), seomachine (11), ColdIQ signal sourcer (10), langgraph outreach research step (13), agentflow (19), gtm-agents (4).
3. **Audience and list building.** Prospect sourcing, enrichment, ICP filtering, list cleaning: ColdIQ (10), LGM (9), Intempt SDR (7), goose-skills (2), n8n templates (15).
4. **Content and creative.** Blog, social, video, ad creative, copy: marketingskills (1), seomachine (11), ericosiu (8), crewAI Content Creator and Instagram (14), Content-Agent-Kit (24).
5. **SEO and AI-search (AEO).** Audits, programmatic pages, schema, internal links: seomachine (11), claude-marketing (5), claude-gtm-plugin (6), marketingskills (1).
6. **Outbound and paid distribution.** Cold email, LinkedIn, sequences, and ad campaigns on Google and Meta: ColdIQ (10), LGM (9), ericosiu Outbound Engine (8), goose-skills (2), claude-marketing paid media (5), Intempt performance marketer (7), Meta and Google MCP servers (17, 18).
7. **Qualify, route, and CRM.** Scoring, reply triage, routing, CRM write-back, human review: langgraph outreach (13), crewAI Lead Score Flow (14), LGM reply tools (9), Intempt GTM engineer (7), HubSpot skills (23), LangChain case study (26).
8. **Conversion and experiments.** CRO, landing pages, A/B tests, autonomous keep-or-revert loops: marketingskills (1), seomachine landing-page commands (11), ericosiu Growth Engine and Autoresearch (8), Intempt experimentation lead (7), autoresearch pattern (12).
9. **Measurement and reporting.** KPI dashboards, anomaly alerts, call and revenue intelligence, weekly performance advice: claude-marketing GA4 pipeline (5), Intempt data analyst (7), LGM analyzers (9), ericosiu Revenue Intelligence (8), marketingskills attribution skill (1).
10. **Retention and lifecycle.** Email lifecycle, churn, referrals, billing triage: marketingskills churn-prevention (1), Intempt lifecycle marketer (7), claude-marketing email (5), ECC billing ops (27).

Structural observations that matter for a folder layout:
- Three organizing schemes exist: by funnel stage (goose-skills collection, LGM), by job role (Intempt, gtm-agents), by tool or integration (n8n templates, MCP servers). Stage-based is the least common but the one a reader grasps fastest.
- The pattern that repeats is `SKILL.md` per folder, plus optional `scripts/`, `references/`, shared context at the root, and an `index.json` (goose-skills, gtm-agents).
- Human-review folders appear in the better repos: seomachine `review-required/`, crewAI human review step, Intempt approval before changes, pipeboard PAUSED-by-default, ericosiu pre-commit PII scrub.

## 3. Gaps the field leaves open

Each is a statement about what these pages showed, not about every repo on GitHub.

1. **Consent capture and contact permission.** No repo in the set treats consent records, do-not-call, or opt-out as a stage. LGM lists "secure my channels" as coming soon. The outreach repos draft and send with no consent check shown.
2. **Attribution tie-out and number trust.** Measurement repos build dashboards and anomaly alerts; none showed a reconciliation of the platform's number against the CRM or ledger, or a pass/fail matrix before a figure is reported. ericosiu's Revenue Intelligence is the nearest.
3. **Call-floor and phone analytics.** Everything is email, LinkedIn, web, or ads. Call recording analysis, dial and connect metrics, speed to lead, and rep coaching are absent apart from ericosiu's call insights.
4. **Loud failure and run supervision.** Most repos have no stall detection, no budget ceiling, no run receipt. Only seomachine's review folder, pipeboard's PAUSED default, and the Intempt approval gate reduce silent damage, and none watch a long run.
5. **Ad-platform write governance.** Meta and community ad MCP servers can write; the safeguard is a confirmation prompt. No approval-token or staged-change pattern appears. Google's official server is read-only.
6. **Local and regulated-data handling.** Only ericosiu ships a PII sanitizer. Nothing in the set separates raw lead or call data from a cloud model.
7. **Offline conversion feedback.** No repo showed sending closed-sale outcomes back to ad platforms.
8. **Home-services and non-SaaS GTM.** Packs assume SaaS, agencies, or ecommerce (trial, signup, pricing page). Field sales with an appointment, a CRM, and a call center are not modeled.
9. **Evidence of results.** Star counts are high (marketingskills 56.3k, autoresearch 98.5k) but none of the pages showed outcome numbers from a running business. A proof section with real numbers is uncommon.

## Caveats
- Star counts are as displayed on 2026-10-24; three pages contradicted themselves (alirezarezvani, awesome-n8n-templates, gtm-agents counts). Fetch summaries came from a small model reading the page.
- Rows 19 to 26 were not opened as GitHub pages. Rows 27 and 28 come from an earlier internal review.
- Several libraries are vendor promotion (La Growth Machine, ColdIQ, Intempt, Pipeboard, Composio). The n8n list earns referral commissions.
