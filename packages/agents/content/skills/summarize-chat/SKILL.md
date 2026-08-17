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

The artifact begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the field-resolution steps in the [Frontmatter resolution](#frontmatter-resolution) section below.

The body following the frontmatter has this structure:

```markdown
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
- Compose tight from the start ([concision principle](../_data/concision.md)): A summary is a distillation, not a transcript
- Focus on the most important findings

## Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill summarize-chat --interactive true --model "$MODEL_ID"` via Bash. Prepend the output verbatim to the artifact body.

## Saving

Resolve artifact directory by invoking `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir`, `project_slug`, and `artifact_paths` from the manifest JSON emitted on stdout. The chats path is `artifact_paths.chats` (default: `chats`).

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

For comprehensive post-session housekeeping (creating tickets for deferred items, documenting discoveries, generating devlogs in addition to chat summaries), use `{skill:wrap-up}`.
