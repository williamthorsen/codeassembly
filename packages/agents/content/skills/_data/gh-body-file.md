# gh body file

Pattern for passing Markdown bodies to `gh` commands without routing content through bash.

## When to use

Any `gh` invocation that takes a Markdown body: `gh issue create`, `gh issue edit`, `gh issue comment`, `gh pr create`, `gh pr edit`, `gh pr comment`, and similar. Applies whenever the body may contain backticks, code fences, or other Markdown that shell quoting could mangle.

## Pattern

1. Write the body to a scratch file using the `Write` tool (raw string, no shell involvement):

   ```
   path: $TMPDIR/gh-body-{timestamp}.md
   ```

   Use `{timestamp}` in `YYYYMMDD-HHMMSSZ` format. When a skill writes bodies in a loop (e.g., one per insight), append an index or sub-second suffix — `gh-body-{timestamp}-{index}.md` — to keep paths unique within the same second.

2. Pass the path to `gh` via `--body-file`:

   ```bash
   gh issue create --title "..." --body-file "$body_path" [other flags]
   gh issue comment {number} --body-file "$body_path"
   gh pr create --title "..." --body-file "$body_path" [other flags]
   ```

   Name the variable `body_path` so retries and follow-on calls reuse the same file unambiguously.

No cleanup is required — `$TMPDIR` is OS-managed.

## Why

Historically, agents authored bodies via single-quoted bash heredocs:

```bash
gh issue create --body "$(cat <<'EOF'
...
EOF
)"
```

Although a `<<'EOF'` heredoc performs no expansion and backticks need no escaping, agents reflexively inserted `\` before every backtick — a habit brought over from double-quoted strings. GitHub rendered the backslashes literally, producing broken code spans (`` \`foo\` ``) and fences (``\`\`\`ts``). The bug recurred across creation flows in multiple repositories.

Writing the body through the `Write` tool removes bash from the path entirely. There is no shell context in which escaping could feel necessary, so the class of bug cannot arise. See codeassembly#442 for the originating incident.
