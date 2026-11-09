# Corpus

The corpus measures the converter (the `convert-agent-prompt` skill, the [extraction rules](extraction-rules.md), and `agent-logic convert`) against real agent prompts. It is in the repository at [`packages/agent-logic/corpus/`](https://github.com/williamthorsen/codeassembly/tree/main/packages/agent-logic/corpus), and the published package does not contain it.

## Contents

`corpus/` contains each prompt verbatim as `<name>.md` and its chart as `<name>.agent-logic.json`. Each prompt is the deployed skill that Claude Code loads, in which every partial and rulebook is expanded, not the skill's source. `corpus/records/` contains an out-of-scope prompt's `<name>.problems.json`, each reviewer's `<name>.review.json`, and `run.json`, which records where each prompt came from, the build or plugin version that produced it, and the run. [`src/corpus/corpus-schemas.ts`](https://github.com/williamthorsen/codeassembly/blob/main/packages/agent-logic/src/corpus/corpus-schemas.ts) defines the review file and `run.json`.

Each chart quotes its prompt by character offset, so the formatter does not touch `corpus/`.

## Scoring

`pnpm run score-corpus`, run in `packages/agent-logic/`, regenerates `corpus/scorecard.md`, and a test fails when the committed scorecard differs. `--prompt <name>` prints one prompt's measures without its review, for the reviewer. `--skill <path>` compares the results against another copy of the skill.

A review records the blob ids of the skill's `SKILL.md` and of `extraction-rules.md` that its conversion followed. A result kept from an earlier round records a recheck against the current ones; the scorer refuses a result that has neither. The current skill is the copy in the `codeassembly-guidance` package that the repository root pins, so a guidance upgrade that changes the skill, or an edit to the extraction rules, fails the scorecard test until each result is rechecked or converted again.

## Refreshing the prompts

`pnpm run refresh-corpus` copies each prompt that `run.json` lists from the file that Claude Code loads, and writes the provenance into `run.json`; [`src/corpus/refresh-corpus.ts`](https://github.com/williamthorsen/codeassembly/blob/main/packages/agent-logic/src/corpus/refresh-corpus.ts) names the files that it reads. It refuses when a declared source has uncommitted changes, when the source in the build's own repository is at another commit than the build, or when another source changed after the build. A refresh leaves the charts and reviews converted from the earlier prompts, so every prompt is converted and reviewed again after it.
