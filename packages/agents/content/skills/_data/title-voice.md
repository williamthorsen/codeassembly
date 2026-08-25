# The title

This file defines how to write a title: the string an author composes for a ticket, a commit, a pull request, or a squash merge. [`title-templates.md`](./title-templates.md) states how that string is rendered into each surface; this file states what to put in it.

The reader is scanning a list -- a `git log`, an issue backlog, a pull-request queue -- and gives each entry one line before moving on.

## The two authored strings

There are two, composed at different moments from different material.

- **The ticket string** is composed by `create-ticket` from conversation context, and is rendered as the issue title alone.
- **The change string** is composed by `summarize-change` or `create-commit` from the diff, and is rendered as the commit title, the pull-request title, and the squash-merge title.

A change's three renderings are one authored string rendered three ways. Composing it once is what keeps them agreeing, and it is why a defect authored into a pull-request title reaches the default branch's log through the squash merge.

## Length

**72 characters, hard.** Both strings are bound by it.

A title gets one line while the reader scans, and the bound is what keeps it there. Past it the line wraps or is cut, and what goes is the end of the sentence, where the specifics are.

The bound measures the authored string rather than any rendering. Each template adds its own prefix and suffix -- a ticket reference, a scope and work type, a pull-request number -- so the same string measures differently on every surface, and the digit count of an issue number moves the line. One bound on the string all four surfaces share is what keeps the rule from depending on which rendering is counted.

## Voice

**Imperative, task-oriented.** "Add…", "Fix…", "Prevent…", "Enable…", describing what the author did. The title appears next to the pull-request number in release notes; it reads as the task. Distinct from the lede voice, which is declarative ("Adds…", "Fixes…"); see [`lede-voice.md`](./lede-voice.md).

The mood is what separates a title from a label. "Enable playback at different speeds" states the task; "Different playback speeds" only names the topic.

## Content discipline

- **The subject, not the occasion.** A change string names what the diff does; a ticket string names the problem. Neither names the review, the meeting, or the conversation that raised it: Never "Address review findings" or "Apply feedback".
- **No ephemeral references.** The title must make sense to a reader who has only a `git log`. A ticket ID, a pull-request number, a review-finding ID, and a run identifier are each a reference that reader cannot resolve.
- **Only what the artifact carries.** External actions -- a ticket updated, a notification sent -- belong to neither string.
- **Specific over categorical.** "Disambiguate phase name mismatch between agents and factory layers", not "Phase name disambiguation". The bound above is a ceiling, not a target.

## Identifiers and backticks

A title carries no backticks. `git log` renders no Markdown, so the markup arrives as literal punctuation around the word the reader most needs to see, and a squash-merge title carries whatever its pull-request title was authored with into the default branch's log unchanged.

Naming the identifier is still the point, and it is often the most informative word in the line. Write it bare: "Add listConsoleLines to toolbelt.vitest" names both the function and the package and reads the same on every surface. Bodies are unaffected -- a commit body, a pull-request description, and a lede each backtick identifiers as usual.

## The ticket reference

The authored string carries no ticket reference. Each surface's template adds one back or does not, per the repository's own `title_format` values, and `describe-change.sh` renders it; the branch name records the ticket besides. Writing the reference into the string doubles it wherever a template supplies one.

## Per-surface framing

For a bug the two strings deliberately differ. The ticket string states the problem; the change string states the fix.

- Ticket: Playback stutters at speeds higher than 32x
- Change: Fix playback stutter at speeds higher than 32x

A ticket titled with its fix presumes the fix before anyone has chosen it, and stops naming the thing a reader searches the backlog for. A change titled with the problem reports a symptom rather than what the diff did.
