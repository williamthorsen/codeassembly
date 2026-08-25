---
name: create-commit
description: Compose and record a commit for one logical unit of work
user-invocable: true
---

# Create commit

Record finished work as a commit: stage one logical unit, render its title, compose its body, and commit.

The conventions the message is composed to -- title format, body voice and mechanics, the work-type taxonomy, and branch naming -- are stated in `{rulebook:commit-conventions}`. Consult it before composing; this skill states the procedure alone.

## What one commit contains

One logical unit of work, together with whatever that unit needs to stand on its own. Work that does not stand alone -- a scaffold a later change fills in -- goes into the change that completes it rather than becoming a commit of its own.

Record each unit as it is finished. Several single-concern commits read better than one that bundles them, and each can be reverted without taking the others with it.

## Process

1. **Read what changed.** Run `git status --short` for which paths changed, then `git diff` and `git diff --cached` for what changed in them. The message reports the diff, so compose it from the diff rather than from what the work set out to do.

2. **Stage the unit.** Stage the paths this commit records, then confirm the staged set is the set the message will describe.

3. **Resolve the title's fields.** The scope and the work type per the conventions; the title text per [`title-voice.md`](../_data/title-voice.md).

4. **Render the title** per [Rendering the title](#rendering-the-title).

5. **Compose the body.** The conventions state its voice and its mechanics; [Line breaks](#line-breaks) below states the one mechanic that binds only while the body is being written.

6. **Commit**, passing the title and body as separate `--message` values so the blank line between them is git's rather than the shell's:

   ```bash
   git commit --message "$commit_title" --message "$body"
   ```

## Rendering the title

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash for `ticket_ref`, then render:

<!-- include: ../_partials/commit-title-rendering.md / -->

## Line breaks

<!-- include: ../../_partials/prose-line-breaks.md / -->
