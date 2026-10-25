---
name: compliance-audit
description: |
  Run a control-mapped compliance gap assessment against the frameworks that
  actually apply to this org: SOC 2 (Trust Services Criteria), PCI-DSS (SAQ-A
  via Stripe-hosted payments), ISO 27001 (Annex A), GDPR/CCPA, and the AI-specific
  ones (ISO 42001 + EU AI Act) that bear on our AI products. Produces a gap
  punch-list, evidence asks, and maintains the subprocessor register + PCI scope.
  Use when scoping compliance for a client deal, before claiming a certification
  posture, when onboarding a new data processor, or on a periodic control review.
triggers:
  - "/compliance"
  - "compliance audit"
  - "soc2 gap assessment"
  - "pci scope"
  - "iso 27001 controls"
  - "gdpr / ccpa review"
  - "are we compliant"
  - "subprocessor register"
  - "do we need a DPA"
license: proprietary
metadata:
  owner: ciso
  domain: security-compliance
  version: "1.0"
---

# Compliance Audit & Control Mapper

Honest scoping first: this org is a solo-operator consultancy, not an enterprise.
The goal is **defensible posture + client-deal readiness**, not a vanity
certification. Map real controls, find the real gaps, do not perform theater.

Authority chain: `rules/security.md`, your project's data-handling rule,
`rules/hosted-db-rules.md`. This skill assesses against them.

## Frameworks that apply here (and why)

| Framework | Applies because | Realistic scope |
|-----------|-----------------|-----------------|
| **PCI-DSS** | We take payments | **SAQ-A**: Stripe hosted Checkout / buy buttons means cardholder data never touches our systems. Smallest scope. Keep it that way. |
| **SOC 2** | Clients (esp. law firms) will ask | TSC: Security (required) + Confidentiality + Availability. Type I is the entry posture; Type II needs an observation period. |
| **ISO 27001** | International / enterprise clients ask | Annex A controls. ~75% overlap with SOC 2, so map once, satisfy both. |
| **GDPR / CCPA** | We hold PII (leads, contacts, EU/UK directory work via nigel) | Lawful basis, DSAR process, data retention, processor DPAs. |
| **ISO 42001 + EU AI Act** | We build and operate AI systems | AI management system + risk classification. The privileged-data exposure (client-privileged data in AI pipelines) lives here. |

## Audit process

1. **Scope the engagement.** Which framework, why, for whom (internal posture vs
   a specific client's vendor-security questionnaire). Do not boil the ocean.
2. **Map controls to our reality.** For each in-scope control, record: status
   (met / partial / gap / not-applicable), the evidence that proves it, and the
   owner. Reuse the SOC2 to ISO 27001 to PCI overlap so a control is mapped once.
3. **Find the gaps.** A gap is a control with no evidence or a contradicting
   practice. Rank by risk x likelihood-of-being-asked.
4. **Produce the punch-list.** Concrete remediation per gap, smallest viable fix
   first. Never silently mark a gap as met.
5. **Maintain the registers.** Update the subprocessor register and PCI scope note
   as living artifacts (paths below). Every new AI/data processor = a register row
   before it touches T0/T1 data.

## Output format

```
SCOPE:    SOC 2 Security TSC, for [client] vendor questionnaire
POSTURE:  Type I-ready on 9/14 in-scope controls

GAPS (ranked):
1. [CRITICAL] CC6.1 Logical access, no MFA enforced on the database project admin.
   Evidence missing. Fix: enable MFA on all three database orgs. Owner: the operator.
2. [HIGH] CC7.2 Monitoring, no centralized log review for n8n fleet auth events.
   Fix: route fleet alerts to a reviewed channel. Owner: builder.
3. [MED] CC9.2 Vendor mgmt, subprocessor register incomplete (Apify, Cohere
   missing DPA status). Fix: complete register + request DPAs. Owner: ciso.

MET (evidence on file): CC6.2, CC6.3, CC8.1 ...
N/A (scoped out): card-data controls (PCI SAQ-A, Stripe hosted).

NEXT: close the 1 critical before responding to the questionnaire.
```

## Living artifacts this skill maintains

- `business/compliance/subprocessor-register.md`, every external data processor,
  data tier it touches, no-train attestation, DPA status.
- `business/compliance/pci-scope.md`, why we are SAQ-A and what would break it.
- `business/compliance/data-classification-policy.md`, the published tier policy
  (human-readable form of `data-handling.md`).
- Gap punch-lists land as dated reports under `business/compliance/audits/`.

## Sources to port from (free, vet before importing)

- `Sushegaad/Claude-Skills-Governance-Risk-and-Compliance`, control libraries for
  ISO 27001, SOC 2, PCI-DSS, GDPR, EU AI Act, ISO 42001. Richest control text.
- `alirezarezvani/claude-skills` (`compliance-os`), cs-ciso-iso27001 + cs-soc2
  agent patterns; mine the audit-cycle structure.
- `afiqiqmal/claude-security-audit`, OWASP 2025 + NIST CSF audit that already maps
  findings to PCI/SOC2/ISO. Pair with vibe-security for the technical layer.

Do not wholesale-install. These repos do not know our gates, our SAQ-A scope, or
the privileged-data framing. Port the control text into our SCHEMA + voice.
