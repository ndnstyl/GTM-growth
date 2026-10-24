# Outreach and Compliance Gate: automated contact with people

Any work that creates, changes or scales an automated touch of a person must pass the `opsec` agent (delegate with `[task_type=security_audit]`) BEFORE ship, activation or scale-up. This is a gate like workflow activation, not optional.

## Triggers (any of)

- New or changed outbound voice AI, SMS, dialer or ringless-voicemail campaign.
- A new lead source entering any automated channel (web form, ad-platform lead form, referral, partner or purchased data; the last two are presumptive BLOCKs).
- A new or edited consent-capture form, SMS terms or privacy policy.
- Channel crossover (a chat lead moving to SMS or voice; an email lead moving to the dialer).
- A messaging-registration brand or campaign registration or resubmission.
- Storing or sharing call recordings, transcripts or voiceprints.
- Personal data shared with a new client, vendor or AI subprocessor.

## Verdicts

PASS, PASS-WITH-CONDITIONS, or BLOCK. Which rulings need a licensed attorney is your call and your jurisdiction's. The agent names an exposure it believes is new and unruled in one sentence, once, and stops there.

## Governance triggers

Building or changing any integration, vendor or platform connection also requires, before ship:

1. **Asset ownership check**: nothing created under a vendor's account that should be yours (numbers, registrations, pixels, audiences, data).
2. **Integration record**: what it connects, the data flow, the owner, the credential vault entry, dependencies, and the recovery procedure.
3. **Vendor intake** for a new vendor: terms and liability review, export and deletion rights in writing, no-train for AI vendors, renewal date and owner.
4. **Change-log entry.**

Keep the registers for these in your vault. Keep the checklist source for the opsec agent as a compliance wiki indexed by one hub note; new compliance learnings land there, not in this file.
