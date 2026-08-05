---
name: review-permissions
description: Use at end of session to recommend updates to the Claude Code permissions allow list based on commands used
user-invocable: true
supported-harnesses: [claude]
---

# Review permissions

Recommend modifications to `~/.claude/settings.json` permissions based on commands used in this session.

## Process

1. **Read current settings** from `~/.claude/settings.json` → `permissions`
2. **Review commands executed** in this session
3. **Identify gaps**: Commands that needed manual approval or were missing from the list
4. **Recommend additions**, following the consolidation strategy below
5. **Check deny list**: Do not recommend additions that conflict with `permissions.deny`
6. **Output a proposed diff** to `settings.json`

## Current strategy

The permissions use `acceptEdits` mode + consolidated allowlist + deny list:

- **`acceptEdits` mode** (`defaultMode: "acceptEdits"`) auto-approves all file operations (Read, Edit, Write). This eliminates file-modification confirmation prompts. The worktree-based workflow makes this safe — every branch is trivially revertible.
- **Bash allowlist** uses broad prefix patterns (`Bash(git:*)`) rather than individual subcommand entries (`Bash(git add:*)`, `Bash(git commit:*)`, etc.). One wildcard per tool family.
- **Deny list** blocks destructive patterns that the broad allowlist would otherwise permit. This is the primary safety mechanism for Bash commands.

## Guidance for recommendations

- **Prefer the broadest safe pattern.** `Bash(docker:*)` over listing individual subcommands.
- **When adding a broad pattern, check for destructive subcommands** that need deny list entries. For example, `Bash(git:*)` requires `Bash(git checkout .)`, `Bash(git clean:*)`, `Bash(git reset --hard:*)`, etc. in the deny list.
- **Do not recommend Edit or Read rules** — `acceptEdits` mode covers all file operations. Read rules in the allow list only serve as explicit documentation for paths outside the working directory.
- **Never recommend allowing commands that are destructive by nature** (rm -rf, git push --force, git reset --hard) — these belong in the deny list.
- **Note any commands the user approved manually** that seem intentionally ungated (one-off operations).

## Limitations

There is no formal approval log. Recommendations are based on commands executed in this session and the agent's memory of permission prompts. Invoke this skill while the conversation context is fresh.
