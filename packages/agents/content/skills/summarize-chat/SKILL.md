---
name: summarize-chat
description: Create a summary of the current conversation for distribution
user-invocable: true
---

# Summarize chat

Create a distributable summary of the current conversation.

## Include

- Problems discussed
- Approaches considered
- Solutions attempted
- Final successful solution (if any)
- Other significant findings
- Links to useful references

## Privacy

Replace `/Users/{username}/` with `~/` in file paths. Remove similar personal information.

## Output format

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. See [Frontmatter resolution](#frontmatter-resolution) below for field resolution.

```markdown
---
provenance:
  skill: summarize-chat
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: true
  model: '{model id}'
ticket_id: '{ticket id, omit if absent}'
ticket_ref: '{ticket display ref, omit if absent}'
branch: '{current branch name}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
---

# {Descriptive title}

## Problem

{What was being solved}

## Approaches considered

{Options that were discussed}

## Solution

{What worked - use ✅ or ❌ icons}

## Key learnings

{Important insights - use 💡 icon}

## References

{Useful links discovered}
```

## Icons

Use these to mark significant sections:

- ❌ failure
- ✅ success
- 💡 important learning — the canonical Insight icon defined in [knowledge items](../_data/artifact-conventions.md#knowledge-items)
- 🐞 buggy behavior
- 🚀 performance gain

## Formatting

- Use proper Markdown
- Use sentence case for headings (not title case)
- Focus on the most important findings

## Frontmatter resolution

Resolve the universal-schema fields documented in [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter):

- `provenance.skill`: always `summarize-chat`.
- `provenance.timestamp`: current UTC time in ISO 8601 format.
- `provenance.baseSha`: run `git rev-parse --short origin/main` via Bash; omit if it fails.
- `provenance.isInteractive`: always `true`.
- `provenance.model`: the model identifier executing this skill (read from the environment block in the system prompt).
- `ticket_id`, `ticket_ref`: from session context. Omit when null.
- `branch`: from session context (`branch_name`).
- `commit`: run `git rev-parse --short HEAD`.
- `pr`: resolve via [`../_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
  - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
  - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

  On non-empty output, write the URL to `pr:`. On empty output, non-zero exit, or timeout, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

## Saving

Resolve artifact directory using `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `artifact_paths`. The chats path is `artifact_paths.chats` (default: `chats`).

Full path: `{artifact_base_dir}/projects/{project_slug}/{chats_path}/`

Follow [artifact conventions](../_data/artifact-conventions.md).

Artifact type: `chat-summary`. Filename format:

```
{YYYYMMDD}-{HHMMSS}Z_{descriptive-title}.md
```

Example: `20250718-200926Z_fix-rating-change-does-not-trigger-flag-refresh.md`

## Completion

Report the file path when done. That's all the user needs to know.

## See also

For comprehensive post-session housekeeping (creating tickets for deferred items, documenting discoveries, generating devlogs in addition to chat summaries), use `/wrap-up`.
