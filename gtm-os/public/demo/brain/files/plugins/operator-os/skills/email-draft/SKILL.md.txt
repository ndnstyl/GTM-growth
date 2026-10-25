---
name: email-draft
description: |
  MANDATORY protocol for creating ANY mail draft or reply. Use whenever drafting, redrafting or
  replying to email, before writing a single word. THE ONE RULE THAT IS NEVER SKIPPED: check
  whether it has already been done FIRST (a sent reply on the thread, or a draft already staged by
  you, another agent or the operator). Several agents may work one mailbox at once; the mailbox is
  the shared source of truth, never your session's memory. Also encodes: draft-only staging,
  short-email rule, threading, recipient assertions, survivor verification, PDF-only attachments.
---

# Email Draft Protocol

Several agents may work the operator's mailbox at the same time. Your session's picture of "not yet answered" is stale the moment another agent or the operator touches the thread. Every step below exists because skipping it burns time, tokens or a deadline. The operator sends; an agent never does.

This skill assumes a small mail helper script you own (any language) that talks to your mail provider's API and offers: `thread <id>` (dump a thread with labels), `draft <spec.json>` (stage a draft with attachments and threading), `drafts` (list live drafts), `delete-draft <id>`. Build it once; the rules below say what it must refuse.

## Step router

| Step | What |
|---|---|
| 0 | Is it already done? |
| 1 | Compose |
| 2 | Stage via the helper |
| 3 | **Mandatory:** verify the survivor |
| 3.5 | Attachments: PDF only |
| 4 | Report |

## Critical rules (always true, regardless of step)

- **Check first, always.** A sent reply or an existing draft on the thread means STOP. Never stage a second one.
- **The helper is the only staging path.** A generic "create draft" connector tool that loses attachments, decodes HTML entities or hard-wraps plain text is banned.
- **Draft labels, not search results, are the only proof of survival.** A draft can carry `TRASH` or `SENT` silently; re-fetch and check labels before any trash or replace call.
- **Email and shared drives get the PDF.** `.html` stays local. Never `.md`, `.csv` or `.html` attached or filed to a shared folder.
- **The operator sends, never an agent.** No send API call, ever, under any condition.
- **A draft the operator wrote or edited is theirs.** Never delete or restage it. The helper keeps a ledger of what it staged and its `delete-draft` refuses anything not in the ledger, or whose message id has changed since (a changed id means the operator touched it). When the file behind their draft changes, write the file, give them its absolute path, and stop.

## Step 0: is it already done? (never skip)

Pull the live thread state and answer from what you see, not from memory:

1. **Is there a SENT message from the operator AFTER the message you would answer?** Already answered. STOP and report "already sent at <time>".
2. **Is there a DRAFT on the thread already?** Do not stage a second. Surface the existing one. Thread dumps also show TRASHED drafts: confirm against the live drafts list.
3. **Does the latest inbound change the ask?** A reply drafted against message N is stale if message N+1 arrived. Draft against the newest.
4. **Was the ask answered on a DIFFERENT thread?** Answers travel: a question on thread A is often answered inside a bigger email on thread B. Before answering a question, search sent mail to that recipient over the relevant window and skim for the ask's keywords. If the substance already went out, a new draft is at most a one-line pointer, and usually nothing.

For a fresh outbound, search sent mail and the drafts list on the topic first. Same questions.

## Step 1: compose

- **Short-email rule:** 200 words or less, in short blocks of 2 to 3 sentences with a blank line between, then a sign-off. One topic per email. A single dense paragraph is a wall of text and fails the rule the same way length does. If 200 words cannot carry it, the detail goes in a doc, attachment or card the email points to, or it becomes a meeting. A requested deliverable (a table, a block) may follow as payload. Only needed information.
- **Voice is a register, not a vibe.** Write the body against your own voice profile (see the `your-voice` skill) and run its AI-tell self-audit: "what makes this obviously AI generated?" The helper should enforce the mechanical half at staging by REFUSING any body or subject that matches a banlist pattern. A refusal means rewrite, never bypass.
- First person for the operator; never "the operator has to...".
- Claims: nothing "fixed" or "done" unless the outcome owner confirmed it (staged is not fixed). Never state that the operator owes an action without checking that sent mail proves it is still owed.
- One ask per vendor email. No personal data of customers beyond what the thread already carries.

## Step 2: stage (helper only)

Write a spec JSON to the scratchpad, then run the helper's `draft` command. Spec keys: `to`, `cc`, `subject`, `body` (plain text), `threadId`, `inReplyTo` (the RFC Message-ID header of the message being answered: fetch it, never guess). Assert before staging that recipients are exactly intended, with no cc creep.

**Re-run step 0 as the LAST action before staging** when composing took more than a few minutes or the thread had same-day traffic. Step 0 is a snapshot and it expires.

## Step 3: verify the survivor (the search read-back is NOT enough)

Fetch the draft by id with metadata format; its labels must be `["DRAFT"]` only.

- A fresh draft can silently carry `TRASH` and vanish from every search while "existing".
- **Draft message ids rotate on every touch or autosave**: a stored message id 404s on trash. Re-fetch the draft's current message id immediately before any trash; the draft id is stable, the message id is not. Before ANY replace, re-pull the live draft body: the operator edits in compose between agent touches, and their edited text is the base. Merge, never overwrite.
- **Check the re-fetched labels for `SENT` before any trash or delete.** The operator may have sent the draft in the minute between staging a replacement and removing the old one. If `SENT` appears: ABORT the replace, touch nothing of theirs, and remove YOUR replacement instead; the send made it the stale duplicate.
- **Trash is not removal.** Trashed drafts come back with new message ids as soon as compose autosaves, and the operator sees several drafts. Remove a superseded draft with the draft-delete call, then list drafts by subject and confirm exactly one survivor.
- **A draft delete on a just-sent draft is permanent**, not trash. The helper's delete must refuse any draft whose message carries `SENT` or lacks `DRAFT`, and the delete must run inside the same process after the assertion, or be chained with `&&`. Do not rely on `set -e`; shell tool environments often do not honor it.

## Step 3.5: attachments, PDF only

**Email gets the PDF. The shared drive gets the PDF. `.html` is for the operator locally.** An attached `.html` does not preview in mail clients, and a working file in a shared folder leaks into the company record.

- Convert once with a script that forces light mode, fixes print grids, renders, and prints a verification image plus a checksum. **Look at the image.** Blank and clipped pages are produced silently.
- Check the RENDERED output, not the source: grepping HTML for an em dash returns zero while `&mdash;` renders one on every page.
- **You attach the file. Do not hand the operator a path to drag.** Pass two keys: `attachments` (the real files, which the helper reads and MIME-encodes) and `attachment_declared` (the assertion a delivery-gate hook reads; it attaches nothing). Passing only the declaration clears the hook and produces a draft that SAYS "attached" and carries no file. Pass both.
- Verify the bytes landed: walk the draft payload for the attachment part, download it, and compare its checksum with the local file.
- The mail ceiling is 25 MB per message. Above that, file to the drive and send a link.
- Email is transport, the drive is the record. File any deliverable the email carries to the right shared folder first, byte-verified, with versioned filenames; superseded versions move to a `_superseded` folder, never deleted.

## Step 4: report

Tell the operator: draft id, thread, one-line summary. If step 0 found it already done, say that instead; that IS the deliverable. Never report "drafted" for something already sent.
