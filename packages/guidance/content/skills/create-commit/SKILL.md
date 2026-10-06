---
name: create-commit
description: Compose and record a commit for one logical unit of work. Pass the paths to stage and a one-line statement of the change's purpose.
background: false
context: fork
model: sonnet
user-invocable: true
---

# Create commit

Record finished work as a commit: stage one logical unit, render its title, compose its body, and commit.

The conventions to which the message is composed -- title format, body voice and mechanics, the work-type taxonomy, and branch naming -- are stated in `{rulebook:commit-conventions}`. Consult it before composing; this skill states the procedure alone.

## Arguments

- **Paths**: The paths that this commit records. When the arguments do not name any, the candidates are every changed path in the working tree.
- **Purpose**: One line stating why the change was made. The diff shows what changed; the purpose is the only source of why. When the arguments do not state one, compose the body from the diff alone, and never state a reason that the diff does not show.

Everything else comes from the repository: This procedure may run without the conversation that produced the change, so it never relies on anything that only that conversation contains.

## What one commit contains

One logical unit of work, together with whatever that unit needs to stand on its own. Work that does not stand alone -- a scaffold filled in by a later change -- goes into the change that completes it rather than becoming a commit of its own.

Record each unit as it is finished. Several single-concern commits read better than one that bundles them, and each can be reverted without taking the others with it.

## Process

1. **Read what changed.** Run `git status --short` for which paths changed, then `git diff` and `git diff --cached` for what changed in them. The message reports the diff, so compose it from the diff rather than from what the work set out to do.

2. **Stage the unit.** Stage the paths that the arguments name, then confirm that the message will describe exactly the staged set. When the arguments do not name any, stage every changed path, but only if those changes form one unit per [What one commit contains](#what-one-commit-contains); if they don't, stop without committing and report the units that you found.

3. **Resolve the title's fields.** The scope and the work type per the conventions, choosing the type by [Work type test](#work-type-test); the title text per [`title-voice.md`](../_data/title-voice.md), with any backticks stripped.

4. **Render the title** per [Rendering the title](#rendering-the-title).

5. **Compose the body** from the staged diff, taking its reason from the stated purpose. The conventions state its voice and its mechanics; [Line breaks](#line-breaks) below states the one mechanic that binds only while the body is being written.

6. **Commit** from a message file, never through `--message`. Write the title, a blank line, and the body to a scratch file per [gh body file](#gh-body-file), naming it `commit-message-{timestamp}.md`; do not inline the message into the shell command.

   ```bash
   body_path="{absolute path from the write step}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   git commit --file "$body_path"
   ```

7. **Report the result**: the new commit's short SHA and title, or, when step 2 stopped or the commit failed, why nothing was committed.

## Work type test

<!-- include: ../../_partials/work-type-choice.md / -->

## Rendering the title

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash for `ticket_ref`, then render:

<!-- include: ../_partials/commit-title-rendering.md / -->

## Line breaks

<!-- include: ../../_partials/prose-line-breaks.md / -->

<!-- include: ../_partials/gh-body-file.md / -->
