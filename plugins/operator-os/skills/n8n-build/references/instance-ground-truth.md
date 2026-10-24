# Instance ground truth (template: fill in from your live instance)

Verified: <date>. Re-verify after every n8n upgrade; this file is version-bound.

| | |
|---|---|
| URL | e.g. localhost on the default port, under a service manager |
| Version | read it from the installed package |
| Database | path to the database file (note any nested directory) |
| API key | stored in the instance's key table; read it from there, never print it |
| Owner and project | one user, one project, or list them |
| Start wrapper | the script that sets environment flags such as the task-runner mode and any nodes-exclude list |

## Nodes that do not load here

n8n 2.x ships a non-empty default exclusion list in its config package (`executeCommand` and `localFileTrigger` among them). **An unset `NODES_EXCLUDE` means the default applies, not that nothing is excluded.** An excluded node renders as "?" on the canvas with live wiring into it. The node file being present in the base package proves the file is installed and nothing else. Your deploy script must refuse to ship an excluded type. Enabling an excluded type is a security-posture change (arbitrary shell execution for every workflow on the box) and is the operator's call.

## Credentials that exist (names and types only, never values)

| Name | Type |
|---|---|
| | |

If there is no credential for a model provider, anything needing that model cannot run natively here.

## Legal donor workflows (running on THIS instance)

| Workflow | Gives you |
|---|---|
| | the node types and versions it proves work, the error-handler pattern, a scheduled trigger |

Pull a donor's exact parameters from the database instead of guessing: load the `nodes` column of the `workflow_entity` row for the donor's id, and print each node's name, type, typeVersion and the first 200 characters of its parameters.
