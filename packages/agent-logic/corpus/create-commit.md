---
name: create-commit
description: Compose and record a commit for one logical unit of work. Pass the paths to stage and a one-line statement of the change's purpose.
background: false
context: fork
model: sonnet
user-invocable: true
---
<!-- codeassembly-skill:create-commit -->

# Create commit

Record finished work as a commit: stage one logical unit, render its title, compose its body, and commit.

The conventions to which the message is composed -- title format, body voice and mechanics, the work-type taxonomy, and branch naming -- are stated in `/consult-commit-conventions`. Consult it before composing; this skill states the procedure alone.

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

3. **Resolve the title's fields.** The scope and the work type per the conventions, choosing the type by [Work type test](#work-type-test); the title text per [`title-voice.md`](~/.claude/skills/_sources/codeassembly-guidance/_data/title-voice.md), with any backticks stripped.

4. **Render the title** per [Rendering the title](#rendering-the-title).

5. **Compose the body** from the staged diff, taking its reason from the stated purpose. The conventions state its voice and its mechanics; [Line breaks](#line-breaks) below states the one mechanic that binds only while the body is being written.

6. **Commit** from a message file, never through `--message`. Write the title, a blank line, and the body to a scratch file per [gh body file](#gh-body-file), naming it `commit-message-{timestamp}.md`; do not inline the message into the shell command.

   ```bash
   body_path="{absolute path from the write step}"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   git commit --file "$body_path"
   ```

7. **Report the result**: the new commit's short SHA and title, or, when step 2 stopped or the commit failed, why nothing was committed. Do not comment on the title's format. The template sets which tokens the title contains, a ticket reference among them, so neither a token that the title omits nor a difference from earlier commits is a finding.

## Work type test

**Choosing a work type.** Whom a change affects decides its type, not the format of its files. Apply the descriptions in `~/.claude/skills/_sources/codeassembly-guidance/_data/work-types.json` to the change itself. Never infer a type from how earlier changes were typed, because many were typed wrongly.

**`fix` requires a defect that a consumer meets.** Two questions decide it, in order.

1. **Does a consumer meet the behavior that changed?** When none does, the type is the one for that audience (`tests`, `tooling`, `ci`, `internal`), whatever the change repaired. A lint rule, a build script, and a test helper are not consumer-facing, so a repair to one is never `fix`. The same question settles a latent condition: When it could not be observed by any consumer, the change does not repair any defect, and evidence that the condition pre-dated the change is not evidence that it was one.
2. **Did the effect differ from what its author intended?** Compare the intended effect with the actual one. That the code or the text was written deliberately does not settle it, because a deliberate rule can still produce an effect that its author did not intend. When the effect diverged from the intent, the type is `fix`. When it matched, and the change reflects a new decision about what the intent should be, the type is `feat`. When intent and effect are both unchanged and only the construction differs, the type is `refactor`.

The test runs in both directions. `fix` is public tier, so typing an improvement `fix` publishes a "Bug fixes" entry telling every reader that something was broken, and typing a genuine defect `refactor` withholds a repair that a reader needs. A defect in consumer-facing behavior is `fix` whatever else the change does, and neither the branch's bulk nor the ticket's subject displaces it.

- **Repo-agnostic guidance is source code.** Skills, skill data, partials, subagent definitions, and rulebooks written for use in any repository take the type that the same change to source code would take. A wording correction is `fix` when the text failed to say what its author already intended, and `feat` when it states a new decision; the repair of a writing-rule violation is the former. A restructuring is `refactor` only when it leaves the text read by the agent unchanged, as extracting a partial does. A token cut that does not change any behavior is `perf`.
- **Guidance on working in one repository is `ai`.** That repository's `AGENTS.md`, its repo-local skills, and its agent configuration take `ai`.
- **Guidance to agents is never `docs`.** `docs` is documentation for human readers, and a change confined to code comments is `docs`.
- **Content decides.** What guidance says decides whether it is repo-agnostic, not its file name, location, or format.

## Rendering the title

Invoke `node ~/.claude/skills/_sources/codeassembly-guidance/derive-session-context/derive-session-context.mjs` via Bash for `ticket_ref`, then render:

```bash
node ~/.claude/scripts/describe-change.mjs render-titles \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit_title',''))"
```

Pass `--ticket-ref` from the bundled session-context deriver so that a project whose `commit.title_format` references `{ticket_ref}` renders the ref. Omit any flag whose value is empty or null, `--ticket-ref` included when session context reports it as `null`.

Parse the output with a JSON parser (`python3` above; `jq -r '.commit_title'` if `jq` is available) rather than `grep` or `cut`: A rendered title may contain backslash-escaped double quotes, which a regex extractor silently truncates.

The pipeline prints the rendered title. Read it from the command's output and use it verbatim as the commit title, which already contains the rendered prefix, per the configured `commit.title_format`, and the bare title text. Assigning the parse instead prints nothing, and a shell variable does not survive to the commit call, so copy the title as literal text into the message file. If the script is not found, or the pipeline prints an empty title because `commit.title_format` is empty or unset, use the bare `{title}`.

## Line breaks

**No hard line breaks.** Write each paragraph and each list item as a single line. Do not insert newlines to wrap at a column width. Every surface that renders this text wraps it, and GitHub turns a newline inside a paragraph into a literal line break, so hand-wrapped prose renders ragged.

This rule applies to text composed for a rendering surface: a commit body, a PR or issue body, a comment, a saved artifact. Inside the repository, the project's formatter decides instead; if the project has none, follow the convention already in the file.

## gh body file

Pass composed content to a CLI through a file, never through the shell. This governs every command that takes composed content, such as a Markdown body, a commit message, or a JSON or YAML payload; `git commit`, `gh pr create`, `gh issue comment`, and `acli jira workitem create` are examples. The shell damages composed content in two ways. A double-quoted argument has its backticks and `$(…)` expanded, and the shell runs what the message only meant to quote. A single-quoted argument cannot hold an apostrophe, and an agent drops the character rather than escape it, which leaves text that still parses and reads wrong.

**Resolve the scratch directory; never reference it.** Create one with `mktemp -d "${TMPDIR:-/tmp}/gh-body.XXXXXX"` in a Bash call and use the absolute path that call prints; bare `mktemp -d` picks a path denied by the agent sandbox. Because the Write tool does not perform shell expansion, a path containing `$TMPDIR` handed to it creates a directory named `$TMPDIR`.

**Name the file for its consumer.** `gh-body-pr123-{timestamp}.md`, `gh-body-issue456-{timestamp}.md`, `gh-body-insight2-{timestamp}.md`, with `{timestamp}` in `YYYYMMDD-HHMMSSZ` format. A body written for a different target is then visibly not this one's, and a loop does not need a separate collision rule.

**Assign the path and guard it inside the call that consumes it.** Nothing survives a Bash invocation: neither `$TMPDIR`, whose value changes between calls, nor a variable set by an earlier call. Every invocation that passes a body file opens with the assignment and refuses on a missing or empty file.

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
```

The guard makes the failure loud. `gh` accepts `--body-file ""` without complaint and publishes its own default body in place of the composed one, and given an empty file it publishes an empty body just as quietly. An unset variable fails `[ -s ]`, so the refusal holds even when the assignment is dropped.

A retry re-states the assignment rather than inheriting it. The file is the same file; only the handoff is re-done.

A bundled helper that refuses a missing or empty file itself takes the literal absolute path, unquoted, without the assignment or the guard. The skill that invokes such a helper says so at the call.

Why a file rather than the shell, and why the path is re-stated at every call: [gh body file](~/.claude/skills/_sources/codeassembly-guidance/_data/gh-body-file.md).
