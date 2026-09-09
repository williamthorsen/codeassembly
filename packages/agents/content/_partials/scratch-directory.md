## Scratch files

A file that is not part of the work itself -- a body staged for a publishing command, a payload handed to a subagent, a fixture built to exercise a script -- goes in a scratch directory resolved by these three rules. `{harness_home_dir}/skills/_data/scratch-directory.md` states what each one prevents.

**Resolve a base once, and never inside the repository.** Use the harness's session scratchpad where the environment names an absolute path for one. Where it does not, create a directory under `$TMPDIR` in a Bash call and use the value that call prints:

```bash
mktemp -d "${TMPDIR%/}/<prefix>.XXXXXX"
```

Keep the X run at the end of the template, the only position macOS substitutes, and do not rely on `-t`. Bare `mktemp -d` ignores `$TMPDIR` and picks a path the agent sandbox denies.

**Re-state the base as an absolute path at every use.** Nothing carries it between uses: A file tool expands no shell syntax, so `$TMPDIR/x` handed to one creates a directory named `$TMPDIR`, and a shell variable does not outlive the Bash invocation that set it. Write the resolved absolute path into each command and each file-tool call, and re-state it on a retry rather than inheriting it.

**Write absolute paths beneath the base; never `cd` into it and write relative ones.** This is what makes a failed resolution loud. `cd ""` returns 0, so `set -e` does not stop a script whose base came out empty, and every later relative write lands in the invoking directory instead. Where a script must hold the base in a variable, read it as `${base:?scratch directory not resolved}`, which does abort.
