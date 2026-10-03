---
slug: williamthorsen-comment-preferences
description: Form of agent-authored comments, covering the mood of an inline comment, the form of a doc description, and the wrapping of a comment's lines.
delivery: [ambient, hook]
version: '4'
---

# William Thorsen's comment preferences

Grammatical register and line wrapping for comments written into source. Comment discipline decides what deserves a comment and what a comment may say; only form is set here.

## Doc descriptions

<!-- rule: doc-descriptions 1 -->

When a description leads with a verb, the verb is third-person indicative with the subject understood: "Builds the canonical payload shape", not "Build the canonical payload shape".

Existing imperative descriptions are drift, not local standard. Do not imitate them.

## Inline comments

<!-- rule: inline-comments 1 -->

An explanatory inline comment describing a logical step is imperative, not declarative or passive: "Validate arguments", not "Validates arguments" or "Argument validation".

## Line wrapping

<!-- rule: line-wrapping 1 -->

When an edit pushes a line of a wrapped comment past the width that its other lines keep, reflow the paragraph from that line on. A reflow changes only whitespace; make it as part of the edit, without asking.
