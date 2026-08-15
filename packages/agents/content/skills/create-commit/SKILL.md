---
name: create-commit
description: Compose and record a commit for one logical unit of work
user-invocable: true
---

# Create commit

Record finished work as a commit: stage one logical unit, render its title, compose its body, and commit.

The conventions the message is composed to -- title format, body voice and mechanics, the work-type taxonomy, and branch naming -- are carried by `{rulebook:commit-conventions}`. Consult it before composing; this skill carries the procedure alone.

## What one commit holds

One logical unit of work, together with whatever that unit needs to stand on its own. Work that does not stand alone -- a scaffold a later change fills in -- rides with the change that completes it rather than landing as a commit of its own.

Record each unit as it is finished. Several single-concern commits read better than one that bundles them, and each can be reverted without taking the others with it.

## Process

1. **Read what changed.** Run `git status --short` for which paths changed, then `git diff` and `git diff --cached` for what changed in them. The message reports the diff, so compose it from the diff rather than from what the work set out to do.

2. **Stage the unit.** Stage the paths this commit records, then confirm the staged set is the set the message will describe.

3. **Resolve the title's fields.** The scope, the work type, and the title text, each per the conventions.

4. **Render the title.** Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash for `ticket_ref`, then render:

   ```bash
   json=$({harness_home_dir}/scripts/describe-change.sh \
     --title "{title}" \
     --scope "{scope}" \
     --type "{type}" \
     --ticket-ref "{ticket_ref}")
   commit_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit_title',''))")
   ```

   Omit any flag whose value is empty or null, `--ticket-ref` included when session context reports `ticket_ref` as `null`. Projects whose `commit.title_format` references `{ticket_ref}` render the ref from that flag alone.

   Parse the output with a JSON parser (`python3` above; `jq -r '.commit_title'` where `jq` is available) rather than `grep` or `cut`: A rendered title may carry backslash-escaped double quotes, which a regex extractor silently truncates.

   Use `commit_title` as the commit title verbatim -- it already carries the rendered prefix and the bare title text. Where the script is not found, fall back to the bare title.

5. **Compose the body.** The conventions carry its voice and its mechanics; [Line breaks](#line-breaks) below carries the one mechanic that binds only while the body is being written.

6. **Commit**, passing the title and body as separate `--message` values so the blank line between them is git's rather than the shell's:

   ```bash
   git commit --message "$commit_title" --message "$body"
   ```

## Line breaks

<!-- include: ../../_partials/prose-line-breaks.md / -->
