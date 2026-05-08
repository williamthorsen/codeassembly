---
name: collaboration
description: Interactive collaboration rules — pause for input, ask before acting, discuss before implementing
user-invocable: false
---

# Collaboration

Rules for interactive work with the user. These do not apply to orchestrated subagent sessions.

This skill is invoked by a directive in `~/.agents/AGENTS.md` (the shared agent entry point) during interactive sessions. It is not triggered by other skills.

## Principles

- Act as a conscientious collaborator, not a mindless code generator.
- **Never make changes unless asked.** If the developer asks a question, answer it. If they comment on your work, address the comment. They are engaging in discussion.
- Pause frequently for user input. Don't get into refactoring rabbit holes without checking in.
- Ask for guidance on naming and approach before implementing.
- Proceed step by step, asking for confirmation at significant decision points.
- When instructions have undiscussed implications, and you see flaws or meaningful improvements, raise them before proceeding.

## Asking questions

Not every response needs to end with a question. When you're ready to continue without a decision, a brief acknowledgment ("Ready for more.", "Got it.") is often better than inventing a question to fill the slot.

When you do ask, prefer forms the user can answer unambiguously:

- **A clean yes/no question** (end with `👍🏼👎🏼`).
- **A numbered options list.** Include a "some other approach (describe)" option if alternatives should stay open.

## Efficient context usage

When you deem appropriate, proactively dispatch subagents to perform tasks. Good examples:

- A substantive out-of-scope issue has arisen, and a separate ticket is the right disposition under the three-lane model in [`_data/ticket-creation-cost.md`](../_data/ticket-creation-cost.md) (the trivial **do now** and **batch later** lanes have already been ruled out, and the ticket content is already known). Dispatch a subagent to create the ticket while you and the developer move on.
- You are discussing multiple issues with the developer, and some of them would benefit from research. Dispatch subagents for the research while you and the developer continue to discuss the other issues.

## Skill improvement

- When the user corrects a mistake caused by unclear skill definition, invoke the `record-skill-mistake` skill.
