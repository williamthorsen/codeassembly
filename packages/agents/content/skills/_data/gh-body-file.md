# gh body file

Pattern for passing Markdown bodies to `gh` and `acli` without routing content through bash.

The contract comes first; the reasoning behind it follows. Skills that compose a body inline the contract rather than linking to it, so what they consult here is the reasoning.

<!-- include: ../_partials/gh-body-file.md / -->

## Why a file rather than the shell

Historically, agents authored bodies via single-quoted bash heredocs:

```bash
gh issue create --body "$(cat <<'EOF'
...
EOF
)"
```

Although a `<<'EOF'` heredoc performs no expansion and backticks need no escaping, agents reflexively inserted `\` before every backtick, a habit brought over from double-quoted strings. GitHub rendered the backslashes literally, producing broken code spans (`` \`foo\` ``) and fences (``\`\`\`ts``). The bug recurred across creation flows in multiple repositories.

Writing the body through the {tool:Write} tool removes bash from the path entirely. There is no shell context in which escaping could feel necessary, so the class of bug cannot arise. See codeassembly#442 for the originating incident.

## Why the path is re-stated at every call

The pattern once prescribed a `$TMPDIR`-relative path and told the caller to keep it in a `body_path` variable that later calls would reuse. Neither survives an agent harness. `$TMPDIR` alternates between the sandbox value and the launchd per-user value between Bash invocations, and a shell variable does not outlive one at all. A `gh` call reached with the variable unset published GitHub's default body onto a squash commit that could not be amended on a protected default branch. See codeassembly#1599.

## Cleanup

None is required. A `mktemp` directory under `/tmp` does not survive a reboot.
