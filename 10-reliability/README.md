# 10 · Reliability

Nothing fails quietly: jobs heal, stall alarms fire, data gates hold.

## Agents

- **CI pair**: Commits finished work and verifies it passes checks and secret scans
- **Security reviewer seat**: Reviews every build for security and data exposure

## Skills

- **Data classification**: Decides which data may go to which AI tool
- **Compliance audit**: Control-mapped gap review against SOC 2, PCI, ISO, privacy and AI rules
- **Diagnose**: Test-first method for silent failures

## Loops

- **Self-healing**: Detects and repairs failed jobs before anyone notices
- **Health and stability census**: Peer-reviewed checks that every scheduled job is alive and producing output
- **Reporting regression suite**: Catches a broken number before it ships
- **Daily data completeness gate**: Holds reports when a feed is missing a day
- **API rate governor**: Keeps every integration under vendor rate limits
- **Nightly backup**: Every store is backed up off-box each night
