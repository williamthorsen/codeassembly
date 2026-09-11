---
slug: readme-conventions
description: What belongs in a README, how its shape follows from what it describes, and where detail goes when it leaves. Consult before writing, revising, or tightening a README, or before adding a section to one.
delivery: skill
version: '1'
---

# README conventions

A README answers two questions for a reader who arrived a moment ago: whether this is the right thing, and how to begin using it. The reader decides in about thirty seconds. What earns a place is what serves that decision and the first successful use; the rest is reference, and reference has other homes.

## Audience

A README is written for people. `AGENTS.md` is the agent-facing companion, and it takes the context that an agent needs and a human reader does not: exact test invocations, constraints on what to modify, conventions that a contributor absorbs from the code but that an agent must be told.

The split is not a matter of taste. An agent loads `AGENTS.md` in full at every session, so a line there costs something every time, where a human reads a README once and skims it later. Routing content by who reads it keeps both files short.

Where agents are the only likely readers, the README states what the thing is and where its entry points are, and stops. A stub is the correct shape there, not a gap to fill.

## Types

What the README describes decides its shape. Find the row; the rest of this rulebook is the general case that each row narrows.

| Type                                          | Leads with                                                  | Keeps                                                              | Omits                                                 |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Application or service (`application`)        | What it does for the person running it                      | Screenshots, how to run it, how to configure a first run           | Internal architecture, exhaustive configuration       |
| CLI tool (`cli`)                              | The install command, then the single most common invocation | Copy-pasteable examples of the two or three real tasks             | A command inventory, which `--help` already prints    |
| Library or package (`library`)                | The import line and a minimal use in about three lines      | The problem it solves, and how it compares to known alternatives   | A full API listing, once it outgrows the first screen |
| Configuration or preset package (`config`)    | How to consume, extend, override, and compose it            | Per-option detail, which is the subject here rather than an excess | Narrative about the tools that it configures          |
| Monorepo root (`monorepo-root`)               | What the repository is, and a map of its packages           | One bootstrap command, and where each package's README sits        | Anything a package's own README states                |
| Content or data repository (`content`)        | What the content is, and the shape it takes                 | The authoring contract: how to add an entry, and what checks it    | Detail belonging to whatever consumes the content     |
| Internal or agent-facing package (`internal`) | What the thing is, and its entry points                     | A pointer to the guidance that governs work on it                  | Everything else                                       |

Screenshots earn their place in the application row and almost nowhere else. A library has no interface to show, and a terminal recording of a CLI demonstrates one path where the text already shows three.

## Recording the type

A README records its row on its first line, as `<!-- readme-type: <slug> -->` with the slug from the Type column, so that the choice of row happens once rather than at every revision. Writing a README adds the marker. Revising one follows it; where the marker is missing or names no row, choose the row that fits and add the marker.

The marker records a decision rather than a fact. Where it no longer fits what the README describes, such as an internal package that is now published, say so before editing rather than following it.

## The first screen

The opening makes up to three moves, in order. The first applies to every type; the second and third apply wherever a reader installs, imports, or runs the thing.

1. **One sentence of identity.** What this is and who it serves. "A lightweight CLI that converts Markdown to PDF" tells a reader more than a paragraph of welcome.
2. **How to get it running.** The install command, the import line, or the bootstrap command, whichever the type calls for.
3. **The smallest thing that works.** One example, short enough to read without scrolling, that a reader can run unchanged.

A README that reaches its second heading before making the moves that apply to it has buried its answer.

## Moving detail out of the README

The test is who a section is written for, not how long the README has grown. A section addressed to a reader who has already decided to use the thing, and who has come back with a specific question, belongs in the `docs/` directory of the tier that owns it: the repository's for a root README, the package's own for a package README.

Detail about one symbol's behavior, such as its edge cases, its failure modes, and the reason for a rule that it enforces, belongs in that symbol's doc comment, where a caller reads it while holding the symbol. A README paragraph that would make a good doc comment is a doc comment in the wrong file.

Length is a symptom worth reading, with one hard limit: The npm registry truncates a published package's README at 65,536 characters, silently and mid-sentence, and `wc -m README.md` measures it. Within that limit, a configuration package whose README runs long because per-option detail is its subject is correct as it stands; an application README of the same length usually has a reference manual hiding inside it.

Move the section, and leave a link where a reader looking for it would have found it. A pointer costs one line, and a reader who concludes the answer does not exist costs more.

## What never belongs

- Anything the tool prints about itself. A command table restates `--help` and goes stale the moment a flag changes.
- Release history, which is the changelog's subject.
- Badge walls and marketing copy. A badge that a reader acts on earns its line; the rest is decoration.
- Content copied from another file. Two copies of one fact drift apart, and the copy that nobody owns is the one that goes wrong.

These share a failure mode: Each stays wrong with no test failing and no reader complaining.

## Adding a type

The table extends by rows. A new row earns its place when it produces a README that its neighbors would get wrong, and it states four things: the slug that its marker takes, what the README leads with, what it keeps that the others drop, and what it omits that the others keep. A row differing from its neighbor only in wording is evidence that the distinction is not real; merge the two.
