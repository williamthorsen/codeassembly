# Shared agent instructions

## Interactive work

- Invoke the `collaborate` skill when working interactively with the user (not applicable to orchestrated subagent work)

## Style

- Code style should adhere to `.editorconfig`, if there is one.
- Order lists and collections logically (alphabetically unless there is a good reason to sort or group differently).
- Use long-form CLI options (`--force`, not `-f`) in generated commands and scripts.
- Structure code so the primary logic comes first; place helper functions at the end.
- Name functions with a leading verb (`show_usage`, not `usage`; `build_payload`, not `payload`).

## Concision

Detail adds value up to a peak, then taxes the reader and buries the signal. Compose tight from the start: Lead with the minimal skeleton and add a sentence only when it changes what the reader does. Never drop a decision, constraint, or actionable fact for brevity. If you find yourself trimming, you started too loose. Full principle: `_data/concision.md` in the agents skills tree.

## Plain speech

When writing practical documentation, speak plainly. "Practical documentation" is functional text such as tickets, plans, instructions, PR descriptions, commit messages, and comments. Use the plain word and name who acts: "The function reports two new warnings", not "Findings arrive as the advisory warnings". Creative prose and rhetorical devices are reserved for persuasive documentation such as marketing and website copy.

## Code descriptions

- Every non-trivial function, method, class, and component gets a brief description.
- Do not repeat information the signature already provides (parameter names, types, return types). In languages with doc-tag conventions (`@param`, `@returns`, `:param`, `Args:`, etc.), omit them — the description alone is sufficient.
- Trivial code (simple getters, one-line helpers whose name fully describes their behavior) may omit the description.

## File access

- When given an exact file path, use the read tool directly. Do not search for the file first.
- If the read attempt returns "file does not exist", STOP and ask the user for help — do not attempt to find the file by searching. A missing file at an exact path usually indicates a configuration or environment problem, not a wrong filename.

## Shell commands

- Use `git -C {path}` instead of `cd {path} && git`. Compound `cd &&` commands trigger extra permission prompts.

## Don't test write operations against a live repo

Never exercise destructive or side-effecting operations against the user's working repo as verification. If a script's behavior requires running a command that mutates git state (`git tag`, `git commit`, `git push`, `git branch`, `git reset`, `git rebase`), file state, package state, or any other shared resource, exercise it in a disposable environment — a temp directory (`mktemp -d`), a fresh `git init` with minimal fixtures, or a container.

Why it matters:

- Other sessions, file watchers, CI, release tooling, or IDE extensions on the user's machine can observe in-progress mutations, even if you intend to clean up after.
- Some projects treat new tags/commits as release signals. Once the artifact exists, downstream effects may fire before you can undo it — and some release configurations are immutable (published tags produce permanent artifacts).
- "I can just clean up afterward" is not a substitute for never creating the artifact: Between create and cleanup, anything else on the machine can act on it.

Read-only exercises (`--dry-run`, help text, preview tables, `--list`, exit-code checks on pure-read commands) are safe in the working repo. Anything that writes — even "just for a second" — is not.

## Technical recommendations

- Default to current best practices. Before recommending an approach, verify it reflects the current state of the ecosystem — not a pattern that was standard two years ago.
- When unsure whether your knowledge is current, say so and look it up rather than presenting a possibly outdated approach as the answer.
- Prefer CLI tools over web UI instructions. When a task can be done via a CLI command (e.g., `npm trust`, `gh repo edit`, `gh secret set`), recommend the command — not manual steps in a browser. When multiple commands need to be run, offer to write a script in the most suitable language (other things being equal, prefer bash and TypeScript), following the relevant coding conventions.

## Artifacts

When creating an artifact (plan, devlog, review, change summary, chat summary, etc.), invoke the `save-artifact` skill to resolve path and naming. Do not place artifacts in ad-hoc locations.

A saved artifact records a moment, not a running state. Once written it stands: Never rewrite one to match a later human edit, a rebase, or any other event downstream of it, and never raise its divergence from current state as a defect or as a repair for the user to weigh. Update a saved artifact only where the next step in the flow reads it, or where a skill directs the write (stamping a PR URL into a change summary, for instance).

The same restraint governs the remote ticket. Align its acceptance criteria to the implementation only where the two conflict, or where the gap would mislead a reviewer. Small improvements are made as a matter of course, and the ticket is not rewritten to pretend they were foreseen.

## Commits

Invoke the `create-commit` skill to make a commit. It carries the procedure: what to stage, one commit per logical unit of work, and how the title is rendered. The `consult-commit-conventions` skill carries what the message is composed to -- the title and body conventions, the work-type taxonomy, and the branch-naming format -- and is worth consulting on its own before writing a message by hand.
