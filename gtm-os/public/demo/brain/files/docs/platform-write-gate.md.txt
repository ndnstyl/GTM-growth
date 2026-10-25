# Platform-write gate

The rule: a call that writes to a platform outside your own machine (a CRM, an ad platform, a vendor sheet, a shared drive, email, a hosting account, a workflow server) checks with you first. A change that is local only (code, config, data files, the vault, receipts) is checkpointed and made without asking. The gate is code, not prose, because a rule that can be argued around gets argued around.

The registry ships EMPTY. Until you add a row the hook allows everything and says so once.

## Add a gate

Copy `plugins/operator-os/hooks/platform-writes.json` to `.operator/platform-writes.json` in your project and add rows:

```json
{
  "gates": [
    {"id": "ads-write", "kind": "bash", "platform": "Ad platform",
     "pattern": "adsctl +(create|update|pause)|ads-api.*\\b(POST|PUT|PATCH|DELETE)\\b"},
    {"id": "mcp-sheet-write", "kind": "mcp", "platform": "Spreadsheet",
     "pattern": "mcp__sheets__(update|append|clear)"}
  ]
}
```

`kind` is `bash` (matched against the command string) or `mcp` (matched against the tool name). `pattern` is a POSIX extended regex, matched case-insensitively. Every matching row is collected, so a decoy segment in the same command cannot hide a real write.

## What happens on a match

The call is denied with a message that names the gate and prints the exact approval command. You run it yourself with the `!` prefix, which is not a tool call and never passes through the hook:

```
!python3 "${CLAUDE_PLUGIN_ROOT}/scripts/approve-write.py" ads-write --subject-sha <printed hash> --ttl 900
```

The token is one use, expires, and is pinned to that exact call. The agent then re-issues the same call. A token file without a matching "minted" row in the gate log is treated as a forgery. Minting is itself gated even with an empty registry, so no agent can approve its own write.

## Files

State lives under `.operator/`: `approvals/` (tokens) and `receipts/write_gate.jsonl` (every denial, approval and downgrade). Add `.operator/` to `.gitignore`.

## Principle behind it

If closing a blocker writes to a platform, stop and check. If it is local only, snapshot first (an explicit-path commit), make the change, log it with the revert line, and keep going. A ruled definition (a fee, a tolerance, a zone master) is still the owner's to change.
