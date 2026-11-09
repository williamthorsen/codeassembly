# Conversion agreement

How often repeated runs of the `convert-agent-prompt` skill, now in [williamthorsen/codeassembly-guidance](https://github.com/williamthorsen/codeassembly-guidance), produce the same config from the same prompt. The skill's model cannot guarantee identical extractions, so agreement is measured here rather than asserted.

## Method

- **Prompts:** the `meta.prompt` of each bundled example in [`src/examples/`](../src/examples/), written verbatim to `refund-request.md` and `password-reset.md`. The refund-request prompt was measured before its last sentence, a standing rule of the refund flow, was added.
- **Runs:** 5 per prompt, each by a fresh Claude Code subagent that reads `SKILL.md` by path and follows it. The subagents may not read the bundled examples.
- **Comparison:** the output files, which the `convert` script has already normalized, are grouped at four levels:
  - **Exact:** identical bytes.
  - **Without text:** identical once guard, action, and reason text is removed.
  - **Without spans:** identical once that text and every span are removed, which leaves states, kinds, events, targets, and flags.
  - **State ids:** the same state ids in the same order.

A cell such as `3+1+1` lists the sizes of the groups: three identical runs and two that each differ from the rest.

## Results

Measured on 2026-10-29 with Claude Opus 5.5 (`claude-opus-5-5`), with a version of the skill that predates its copy in [williamthorsen/codeassembly-guidance](https://github.com/williamthorsen/codeassembly-guidance).

| Prompt         | Exact     | Without text | Without spans | State ids |
| -------------- | --------- | ------------ | ------------- | --------- |
| Refund request | 3+1+1     | 4+1          | 4+1           | 4+1       |
| Password reset | 1+1+1+1+1 | 2+1+1+1      | 2+1+1+1       | 3+1+1     |

Every run converted on its first `convert` run. Every run left out the persona and tone lines, and every refund-request run listed the seasonal-promotion habit as unconverted. Every run contains a state for each step of the hand-written example. Two steps are expressed differently: the refund runs end in separate final states rather than a shared `closed` state, and the password runs put the attempt check on the code reply rather than in a counting state.

Where the runs still differ:

- **Unconverted reasons.** The reason's wording varies between otherwise identical refund runs.
- **Leading phrases in a compound state's quote.** One refund run dropped "At any point, if" from the quote of the compound state, which changes that state's id.
- **Resend rule.** Password runs disagree on whether "If the employee asks to resend the code" belongs on the code-asking state or on a compound state around the code steps, and which passage that compound state quotes.
- **Guard and action wording.** Paraphrases of the same condition or action differ between password runs.

## Earlier round

Before the skill showed the shape of a guard and stated what transitions and compound states quote, no two runs of either prompt were identical, and two of ten runs needed a second `convert` run to correct a guard written as a string.
