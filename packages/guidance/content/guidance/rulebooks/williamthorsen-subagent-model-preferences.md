---
slug: williamthorsen-subagent-model-preferences
description: William Thorsen's preferences for which Claude model a subagent dispatch uses, chosen by what the subagent's task produces.
delivery: ambient
supported-harnesses: claude
version: '1'
---

# William Thorsen's subagent-model preferences

When dispatching a subagent through the Agent tool or a workflow's `agent()` call, choose its model by what its task produces:

- A task that only searches for or locates files or code: Pass `haiku`.
- A task that only reads, runs checks, or reports, and does not write code or prose: Pass `sonnet`.
- A task that writes code or prose, including a plan, a ticket, or a message: Leave the model unset, so that the subagent runs on its declared model or the session's.
