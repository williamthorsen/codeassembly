**Sweep the artifacts for anything the conversation settled that they do not record.** After the plan is approved or drafted, before the artifacts are saved, re-read them against the conversation and apply the handoff test: Could a competent developer, reading only the ticket and plan with no access to this conversation, achieve the intended result and make the same decisions? Whatever fails that test is a gap.

This sweep is the completeness counterpart of the [concision](../_data/concision.md) self-check: That one asks what can be cut, this one asks what was never captured. They are a deliberate pair, not competing pressures. An artifact that drops a settled decision isn't concise, it's incomplete.

The handoff test has two halves, and each needs a different reader. The sweep checks that each settled decision is recorded, and it runs in the main session because only the session knows what the conversation settled. The handoff pass checks that the artifacts stand alone, and it runs in a subagent because only a reader with no memory of the session can see a gap: The writer fills each one from memory without noticing the fill.

**Sweep for:**

- Settled decisions, including the rejected alternatives.
- Constraints and scope boundaries on which the conversation agreed.
- Edge cases and success criteria raised in discussion but missing from the acceptance criteria.
- Tacit context of the form "the implementer might not realize X": What the conversation established as known and the artifacts leave the reader to rediscover.

**Place each gap by kind**, per the placement doctrine: Fold the change's subject and outcomes into the ticket and the mechanism into the plan. Where the gap came up in conversation does not decide where it goes. When the invocation produces no ticket artifact, fold a subject-level gap into the plan's context section.

**Run the handoff pass after the sweep's gaps are folded in.** Write the ticket and the plan as drafts to a scratch directory created with `mktemp -d "${TMPDIR:-/tmp}/handoff.XXXXXX"`, using the absolute path that the call prints; they are saved to the artifact directory only once, after this pass. When the invocation produces no ticket artifact, `ticket-source` is the ticket's URL or reference. Dispatch the `{subagent:handoff-reviewer}` subagent via the {tool:Task} tool with this block:

```dispatch
ticket-source: {ticket draft path, or ticket URL or reference}
plan: {plan draft path}
root: {repository root}
```

The block contains scalars only, and only these keys. Compose no prose into it: A sentence written here carries the session's knowledge into the reader, and the pass is worth nothing once the reader shares what the writer knows.

**Fold in each item that the reader returns**, into the drafts: Place a missing fact by kind, per the paragraph above, and correct a claim that the repository contradicts. A question that the conversation settled is answered in the artifact. A question that the conversation never settled is asked of the user before saving, and the answer is folded in like any other item. No second dispatch follows the fold-in: The pass runs once.

**Report and proceed.** When the sweep or the handoff pass finds gaps, fold them in, report the amendments as a brief list, then save the drafts as the artifacts. The report is informational: The amendments record what the conversation already settled or what the repository shows, so they open no approval gate, and the only ask that the sweep opens is a reader question that the conversation never settled. When neither pass finds anything, save silently; a clean sweep is not worth a line.
