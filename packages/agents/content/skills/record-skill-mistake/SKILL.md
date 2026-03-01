---
name: record-skill-mistake
description: Use when the user corrects a mistake that a clearer skill definition would have prevented
user-invocable: true
---

# Record skill mistake

Append a structured entry to `mistakes.md` colocated with the skill that caused the error.

## Process

1. **Identify the skill** whose ambiguity or gap caused the mistake
2. **Summarize** what went wrong and what the skill should have said
3. **Append** to `mistakes.md` in that skill's directory, creating the file if needed

## Entry format

```markdown
- {YYYY-MM-DD}: {What went wrong} → {How the skill should clarify}
```

## Example

File: `agents/common/skills/git-commit-conventions/mistakes.md`

```markdown
- 2025-02-18: Hard-wrapped commit body at 72 chars → Skill should state body has no line-length limit
```

## Notes

- One entry per mistake. Keep entries concise.
- Mistakes accumulate until the next time the skill is revised. Revise a skill when its mistakes.md has 3+ entries or an entry recurs.
