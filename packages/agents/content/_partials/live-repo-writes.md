## Don't test write operations against a live repo

Never exercise destructive or side-effecting operations against the user's working repo as verification. If a script's behavior requires running a command that mutates git state (`git tag`, `git commit`, `git push`, `git branch`, `git reset`, `git rebase`), file state, package state, or any other shared resource, exercise it in a disposable environment: a temp directory (`mktemp -d`), a fresh `git init` with minimal fixtures, or a container.

Why it matters:

- Other sessions, file watchers, CI, release tooling, or IDE extensions on the user's machine can observe in-progress mutations, even if you intend to clean up after.
- Some projects treat new tags/commits as release signals. Once the artifact exists, downstream effects may fire before you can undo it; some release configurations are immutable (published tags produce permanent artifacts).
- "I can just clean up afterward" is not a substitute for never creating the artifact: Between create and cleanup, anything else on the machine can act on it.

Read-only exercises (`--dry-run`, help text, preview tables, `--list`, exit-code checks on pure-read commands) are safe in the working repo. Anything that writes, even "just for a second", is not.
