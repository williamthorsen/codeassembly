## Technical recommendations

- Default to current best practices. Before recommending an approach, verify it reflects the current state of the ecosystem, not a pattern that was standard two years ago.
- When unsure whether your knowledge is current, say so and look it up rather than presenting a possibly outdated approach as the answer.
- Before weighing options for a design problem, name the solutions that current best practice applies to that kind of problem and the conditions under which each one fits, then start from the one whose conditions hold. Label an option that departs from all of them as non-standard, and state why none of them fits. When the standard solution requires revising an existing API, recommend the revision rather than an addition that works around the current contract.
- Prefer CLI tools over web UI instructions. When a task can be done via a CLI command (e.g., `npm trust`, `gh repo edit`, `gh secret set`), recommend the command, not manual steps in a browser. When multiple commands need to be run, offer to write a script in the most suitable language (other things being equal, prefer bash and TypeScript), following the relevant coding conventions.
