---
name: bb-pr-inline-comment
description: Post inline comments on Bitbucket pull requests anchored to specific file paths and line numbers
user-invocable: true
---

# Post inline PR comment on Bitbucket

Post a comment anchored to a specific file path and line number on a Bitbucket pull request using the REST API.

## When to use

- During code review, to leave line-level feedback on a pull request
- When the Bitbucket MCP server's `comment` action is insufficient because it only supports general PR comments, not inline ones
- To post batch review comments programmatically across multiple files

## Arguments

| Flag | Description                 | Required | Default                           |
| ---- | --------------------------- | -------- | --------------------------------- |
| `-f` | File path in the repository | Yes      | —                                 |
| `-l` | Line number                 | Yes      | —                                 |
| `-m` | Comment text                | No       | Reads from stdin                  |
| `-w` | Bitbucket workspace         | No       | Auto-detected from `git remote`   |
| `-r` | Repository slug             | No       | Auto-detected from `git remote`   |
| `-p` | Pull request ID             | No       | Auto-detected from current branch |

## Auto-detection

When `-w`, `-r`, or `-p` are omitted, the script auto-detects values:

- **Workspace and repo** are parsed from `git remote get-url origin`. Both HTTPS (`https://bitbucket.org/ws/repo`) and SSH (`git@bitbucket.org:ws/repo.git`) URLs are supported.
- **PR ID** is resolved by querying the Bitbucket API for open pull requests whose source branch matches the current git branch. If no open PR is found, or if multiple are found, the script exits with a descriptive error.

## Auth setup

The script resolves authentication in priority order:

1. **Bot credentials (Basic auth):** Set `BITBUCKET_BOT_USERNAME` and `BITBUCKET_BOT_TOKEN` environment variables.
2. **API token (Bearer auth):** Set the `BITBUCKET_API_TOKEN` environment variable.
3. **macOS keychain (Bearer auth):** Add a keychain entry (macOS only):

```bash
security add-generic-password -a "$USER" -s "bitbucket-api-token" -w "<your-token>"
```

Generate a token at https://bitbucket.org/account/settings/app-passwords/ with scopes: Repositories (Read), Pull requests (Read + Write).

## Invocation

Run the companion script directly via `bash`:

```bash
bash "$(dirname "$SKILL_PATH")/bb-pr-inline-comment.sh" -f <file> -l <line> -m <comment>
```

Or, if the skill directory is known:

```bash
bash {platform_home_dir}/skills/bb-pr-inline-comment/bb-pr-inline-comment.sh \
  -f src/foo.ts -l 42 -m "Consider extracting this into a helper function."
```

## Examples

### Single comment with all values auto-detected

```bash
bash bb-pr-inline-comment.sh -f src/utils.ts -l 15 -m "This null check is redundant."
```

### Explicit workspace, repo, and PR ID

```bash
bash bb-pr-inline-comment.sh \
  -w myteam -r my-repo -p 123 \
  -f src/handler.ts -l 88 \
  -m "Consider using early return here."
```

### Pipe comment from stdin

```bash
echo "This function has O(n²) complexity — consider a map lookup." \
  | bash bb-pr-inline-comment.sh -f src/search.ts -l 34
```

### Batch comments in a loop

```bash
while IFS=$'\t' read -r file line comment; do
  bash bb-pr-inline-comment.sh -f "$file" -l "$line" -m "$comment"
done <<'EOF'
src/api.ts	12	Missing error handling for network failures.
src/api.ts	45	This timeout value should be configurable.
src/utils.ts	8	Unused import.
EOF
```

## Dependencies

- `curl` — HTTP requests
- `jq` — JSON construction and parsing
- `git` — workspace/repo/branch detection
