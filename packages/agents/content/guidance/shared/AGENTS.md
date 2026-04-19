# Shared agent instructions

## Project discovery

- Read .agents/PROJECT.md (if it exists) for project information
- Read .agents/preferences.yaml (if it exists) for agent settings

## Interactive work

- Invoke the `collaboration` skill when working interactively with the user (not applicable to orchestrated subagent work)

## Style

- Never use title case. Use sentence case for titles, headings, section headers, and interface elements. Preserve the case of proper nouns.
- Code style should adhere to `.editorconfig`, if there is one.
- Order lists and collections logically (alphabetically unless there is a good reason to sort or group differently).
- Use long-form CLI options (`--force`, not `-f`) in generated commands and scripts.
- Structure code so the primary logic comes first; place helper functions at the end.
- Write explanatory comments in imperative mood ("Validate arguments", not "Argument validation").
- Name functions with a leading verb (`show_usage`, not `usage`; `build_payload`, not `payload`).

## Writing style

Use sentence case for all titles, headings, steps, labels, and similar text.
Preserve the case of proper nouns, actual titles of books and movies, and named entities.
Examples:

- "Backend: Express API routes and server" not "Backend: Express API Routes And Server"
- "Frontend: Static Excalibur scene" not "Frontend: Static Excalibur Scene"
- "Customizing the Status Adapter for your backend", not "Customizing the Status Adapter for Your Backend"

## Prompt formatting

When prompting the user for input, use visual markers to make prompts more noticeable:

- **Any yes/no question** (approval, decisions, confirmations): End with `👍🏼👎🏼`.
- **All other questions** (open-ended, clarifications): End with `🤔`

Examples:

- "Do you want me to start implementation? 👍🏼👎🏼"
- "Does this design look correct? 👍🏼👎🏼"
- "Should I proceed with this approach? 👍🏼👎🏼"
- "Which color scheme would you prefer? 🤔"
- "What additional features should I include? 🤔"

## Code descriptions

- Every non-trivial function, method, class, and component gets a brief description. Favor concision, but prioritize communicating the essential information.
- Do not repeat information the signature already provides (parameter names, types, return types). In languages with doc-tag conventions (`@param`, `@returns`, `:param`, `Args:`, etc.), omit them — the description alone is sufficient.
- Trivial code (simple getters, one-line helpers whose name fully describes their behavior) may omit the description.

## File access

- When given an exact file path, use the read tool directly. Do not search for the file first.
- If the read attempt returns "file does not exist", STOP and ask the user for help — do not attempt to find the file by searching. A missing file at an exact path usually indicates a configuration or environment problem, not a wrong filename.

## Shell commands

- Use `git -C {path}` instead of `cd {path} && git`. Compound `cd &&` commands trigger extra permission prompts.

## Technical recommendations

- Default to current best practices. Before recommending an approach, verify it reflects the current state of the ecosystem — not a pattern that was standard two years ago.
- When unsure whether your knowledge is current, say so and look it up rather than presenting a possibly outdated approach as the answer.
- Prefer CLI tools over web UI instructions. When a task can be done via a CLI command (e.g., `npm trust`, `gh repo edit`, `gh secret set`), recommend the command — not manual steps in a browser. When multiple commands need to be run, offer to write a script in the most suitable language (other things being equal, prefer bash and TypeScript), following the relevant coding conventions.

## Workflow

- Questions are not instructions. When the user asks "Did you do X?", answer the question. Do not treat it as a request to do X.
- Prefer ticket-driven development. When follow-up work, new features, or deferred items are identified, ask the user whether to create a GitHub issue rather than implementing ad hoc or silently deferring.
- Changes should flow through the repository via branches and pull requests, not direct edits to the default branch.
- Record insights as comments on the relevant GitHub issue, not just in conversation. Insights about conventions, API patterns, codebase discoveries, and architectural decisions have lasting value.
- If you notice a recurring correction or convention emerging across multiple interactions, suggest codifying it as a rule in agent guidance.

## Artifacts

When creating an artifact (plan, devlog, review, change summary, chat summary, etc.), invoke the `save-artifact` skill to resolve path and naming. Do not place artifacts in ad-hoc locations.

## Commits

- Title: 72 chars max. Format per `git-commit-conventions` skill.
  Imperative verb phrase describing the change: E.g., "Fix type errors in Xyz component".
- Body: No hard line wrapping. Write naturally — do not insert newlines to wrap at a column width.
  Describe the change made by the commit.
  Never describe the process (e.g., "Address reviewer comments") that motivated the commit.
- Ticket ID: Omit from title (branch carries it). Include at end of body only if branch spans multiple tickets.

## PRs

- Never include automated quality checks (CI, linting, type-checking, formatting) in PR test plans.
