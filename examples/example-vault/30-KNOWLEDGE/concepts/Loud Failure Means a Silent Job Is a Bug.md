---
description: A job that can fail without telling anyone is incomplete; every failure path ends in an error, a visible refusal or an alert row.
type: learning
---
# Loud Failure Means a Silent Job Is a Bug

The morning report once showed "0 reviews requested" for three days. The job had lost its login and returned an empty list. Nothing was wrong that anyone could see.

**Rule:** a lookup that finds nothing says so and says why; a missing credential stops the job with the credential's name; a wait has a deadline. In [[Review Request Automation]] a missing phone number prints a line instead of vanishing.

The plugin's loud-failure rule and write-time hook enforce this in code; the lesson here is why.
