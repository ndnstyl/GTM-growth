# 10 · Reliability

Failures flagged loudly: bounded self-healing, stall alarms and data-gap checks.

## Agents

- **CI pair**: Commits finished work and verifies it passes checks and secret scans
- **Security reviewer seat**: Reviews changes that touch consumer contact or customer data before they ship

## Skills

- **Data classification**: Decides which data may go to which AI tool
- **Compliance audit**: Playbook for a control-mapped gap review against SOC 2, PCI, ISO, privacy and AI rules
- **Diagnose**: Test-first method for silent failures

## Loops

- **Self-healing**: Classifies failed scheduled jobs and re-runs or restarts the fixable ones, up to three tries a day, then hands the rest to a person
- **Health and stability census**: Peer-reviewed checks that every scheduled job is alive and producing output
- **Reporting regression suite**: Runs a set of guard tests against the reporting code each day and flags any that fail
- **Daily data completeness gate**: Checks daily that every reporting table has a row for each expected day and lists each gap
- **API rate governor**: Keeps every integration under vendor rate limits
- **Nightly backup**: Every store is backed up each night to a separate disk
