# Reading live state: never from memory, never from a note

Query the instance's own database (SQLite by default):

- Workflows: select id, name, active, isArchived from `workflow_entity`, ordered by name.
- Credentials: select id, name, type from `credentials_entity`.
- Executions: the execution table is pruned. It is a retention window, not a history. The durable counter is `insights_by_period`: type 0 is time saved (minutes), 1 is runtime (ms), 2 is SUCCESS, 3 is FAILURE. Sum `value` grouped by type.

Decode a failed execution: n8n stores a flattened index pool, not plain JSON. Load `execution_data.data` for the execution id, treat any all-digit string below the pool length as a pointer into the pool, and follow pointers to read `lastNodeExecuted`, `message`, `name`, `type` and `stack`.
