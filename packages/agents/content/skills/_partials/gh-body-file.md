## gh body file

Pass composed content to a CLI through a file, never through the shell. This governs every command that takes composed content, such as a Markdown body, a commit message, or a JSON or YAML payload; `git commit`, `gh pr create`, `gh issue comment`, and `acli jira workitem create` are examples. The shell damages composed content in two ways. A double-quoted argument has its backticks and `$(…)` expanded, and the shell runs what the message only meant to quote. A single-quoted argument cannot hold an apostrophe, and an agent drops the character rather than escape it, which leaves text that still parses and reads wrong.

**Resolve the scratch directory; never reference it.** Create one with `mktemp -d "${TMPDIR:-/tmp}/gh-body.XXXXXX"` in a Bash call and use the absolute path that call prints; bare `mktemp -d` picks a path denied by the agent sandbox. Because the {tool:Write} tool does not perform shell expansion, a path containing `$TMPDIR` handed to it creates a directory named `$TMPDIR`.

**Name the file for its consumer.** `gh-body-pr123-{timestamp}.md`, `gh-body-issue456-{timestamp}.md`, `gh-body-insight2-{timestamp}.md`, with `{timestamp}` in `YYYYMMDD-HHMMSSZ` format. A body written for a different target is then visibly not this one's, and a loop does not need a separate collision rule.

**Assign the path and guard it inside the call that consumes it.** Nothing survives a Bash invocation: neither `$TMPDIR`, whose value changes between calls, nor a variable set by an earlier call. Every invocation that passes a body file opens with the assignment and refuses on a missing or empty file.

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
```

The guard makes the failure loud. `gh` accepts `--body-file ""` without complaint and publishes its own default body in place of the composed one, and given an empty file it publishes an empty body just as quietly. An unset variable fails `[ -s ]`, so the refusal holds even when the assignment is dropped.

A retry re-states the assignment rather than inheriting it. The file is the same file; only the handoff is re-done.

A bundled helper that refuses a missing or empty file itself takes the literal absolute path, unquoted, without the assignment or the guard. The skill that invokes such a helper says so at the call.

Why a file rather than the shell, and why the path is re-stated at every call: [gh body file](../_data/gh-body-file.md).
