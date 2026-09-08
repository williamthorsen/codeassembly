## gh body file

Pass a Markdown body to a CLI through a file, never through the shell. This governs every invocation taking a body file: `gh issue create`, `gh issue edit`, `gh issue comment`, `gh pr create`, `gh pr edit`, `gh pr comment`, `gh pr merge`, `acli jira workitem create`, and `acli jira workitem comment create`.

**Resolve the scratch directory; never reference it.** Use the harness's session scratchpad where it supplies an absolute path; otherwise resolve `$TMPDIR` in a Bash call and use the value that call prints. The {tool:Write} tool performs no shell expansion, so a path containing `$TMPDIR` handed to it creates a directory named `$TMPDIR`.

**Name the file for its consumer.** `gh-body-pr123-{timestamp}.md`, `gh-body-issue456-{timestamp}.md`, `gh-body-insight2-{timestamp}.md`, with `{timestamp}` in `YYYYMMDD-HHMMSSZ` format. A body written for a different target is then visibly not this one's, and a loop needs no separate collision rule.

**Assign the path and guard it inside the call that consumes it.** Nothing survives a Bash invocation: neither `$TMPDIR`, whose value changes between calls, nor a variable an earlier call set. Every invocation that passes a body file opens with the assignment and refuses on a missing or empty file.

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
```

The guard is what makes the failure loud. `gh` accepts `--body-file ""` without complaint and publishes its own default body in place of the composed one, and an empty file publishes an empty body just as quietly. An unset variable fails `[ -s ]`, so the refusal holds even where the assignment is dropped.

A retry re-states the assignment rather than inheriting it. The file is the same file; only the handoff is re-done.

Why a file rather than the shell, and why the path is re-stated at every call: [gh body file](../_data/gh-body-file.md).
