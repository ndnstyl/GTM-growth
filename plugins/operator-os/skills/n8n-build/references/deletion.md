# Deleting

Use a delete script, not a bare API call. n8n keeps an archived flag and a workflow-history version store, so a DELETE returning 200 is not proof of removal. The script should scan every table for the workflow id before and after, and check for orphans. Prove removal by scanning for orphans.
