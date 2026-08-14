**Sweep the artifacts for anything the conversation settled that never reached them.** After the plan is approved or drafted, before the artifacts are saved, re-read them against the conversation and apply the handoff test: Could a competent developer, reading only the ticket and plan with no access to this conversation, achieve the intended result and make the same decisions? Whatever fails that test is a gap.

This sweep is the completeness twin of the [concision](../_data/concision.md) self-check: That one asks what can be cut, this one asks what was never captured. They are a deliberate pair, not competing pressures. An artifact that drops a settled decision isn't concise, it's incomplete.

Run the sweep in the main session, never in a subagent. Only the session holds the conversation the artifacts are swept against.

**Sweep for:**

- Settled decisions, including the alternatives they rejected.
- Constraints and scope boundaries the conversation agreed on.
- Edge cases and success criteria raised in discussion that never reached the acceptance criteria.
- Tacit context of the form "the implementer might not realize X" — what the conversation established as known and the artifacts leave the reader to rediscover.

**Route each gap by kind**, per the placement doctrine: The change's subject and outcomes fold into the ticket, mechanism folds into the plan. Where the gap came up in conversation does not decide where it lands. When the invocation produces no ticket artifact, a subject-level gap folds into the plan's context section.

**Report and proceed.** When the sweep finds gaps, fold them in and report the amendments as a brief list, then save. The report is informational: The amendments carry decisions the conversation already settled, so it opens no new approval gate and asks nothing. When the sweep finds nothing, save silently — a clean sweep is not worth a line.
