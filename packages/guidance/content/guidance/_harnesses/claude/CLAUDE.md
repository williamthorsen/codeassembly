Read AGENTS.md (if it exists) in the working directory and treat it as fully equivalent to CLAUDE.md.

<!-- include: ../../shared/AGENTS.md / -->

## Subagent models

When dispatching a subagent through the Agent tool or a workflow's `agent()` call, choose its model by what its task produces:

- A task that only searches for or locates files or code: Pass `haiku`.
- A task that only reads, runs checks, or reports, and does not write code or prose: Pass `sonnet`.
- A task that writes code or prose, including a plan, a ticket, or a message: Leave the model unset, so that the subagent runs on its declared model or the session's.

<!-- codeassembly-ambient:start -->
<!-- codeassembly-ambient:end -->
