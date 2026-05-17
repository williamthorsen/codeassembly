# PR resolution

Shared contract for resolving the `pr:` frontmatter field at artifact write time. Skills do not invoke `gh` or `curl` directly — they call `scripts/resolve-frontmatter.sh`, which implements this contract once and emits the resolved `pr:` value (along with all other canonical frontmatter fields) as part of its output. This document defines the contract the script obeys; consumers do not embed dispatch snippets directly.

## Contract

- Resolution runs at artifact write time, against the current branch.
- The Bash invocation uses a **5-second timeout** (`timeout: 5000` on the Bash tool when calling the script; the script itself wraps the platform CLI in `timeout`/`gtimeout`, falling back to a Perl `alarm`-and-`exec` wrapper so the timeout applies even on stock macOS).
- On **empty output** (no PR exists for the branch — the lookup succeeded), the script omits the `pr` field from its output. Consumers must omit the `pr:` line from frontmatter. Do **not** emit a warning. This is the normal pre-PR case.
- On **failure** (CLI unavailable, auth error, network error, timeout, or any non-zero exit), the script omits the `pr` field from its output and emits the canonical warning to stderr. Consumers must omit the `pr:` line **and** surface the warning in the agent's text output. **Never block the artifact write.**

### Canonical warning text

Emit this exact string in the agent's text output when resolution **fails** (non-zero exit, timeout, CLI/auth/network error). Do **not** emit it when the lookup succeeds with empty output (the no-PR case):

```
Note: PR lookup failed; proceeding without pr field.
```

Pin the phrasing so all affected skills surface the same warning.

### URL formats

| Platform  | Format                                                        |
| --------- | ------------------------------------------------------------- |
| GitHub    | `https://github.com/{owner}/{repo}/pull/{n}` (not `/issues/`) |
| Bitbucket | `https://bitbucket.org/{workspace}/{repo}/pull-requests/{n}`  |

In both cases the CLI returns the correct URL — no interpolation is needed in the dispatch snippet.

### `--state all` rationale (GitHub)

The GitHub dispatch passes `--state all` so closed and merged PRs are resolvable for post-merge artifacts. A review or devlog written after merge should still link back to the PR that produced the change.

## Platform dispatch

The skill reads `platform` from session context (set by `get-session-context`) and runs the matching snippet below. Both snippets read the current branch from `git rev-parse --abbrev-ref HEAD` (or use the `branch_name` already in session context) and produce a single URL string or empty output.

### GitHub

```bash
gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'
```

Invoke via the Bash tool with `timeout: 5000`. On non-empty output, write the URL to the `pr:` frontmatter line. On empty output (no PR exists), omit `pr:` silently — emit no warning. On non-zero exit, timeout, or other failure, omit `pr:` and emit the canonical warning.

### Bitbucket

```bash
curl --silent --fail \
  --header "Authorization: Bearer $BITBUCKET_API_TOKEN" \
  "https://api.bitbucket.org/2.0/repositories/$WORKSPACE/$REPO/pullrequests?q=source.branch.name=\"$BRANCH\"&state=OPEN,MERGED,DECLINED" \
  | jq --raw-output '.values[0].links.html.href // empty'
```

Invoke via the Bash tool with `timeout: 5000`. The Bitbucket response exposes the PR URL at `links.html.href` — verified against [`review-bb-pr/SKILL.md`](../review-bb-pr/SKILL.md) (the field is captured at step 2 of that skill's process and surfaced as `url` in its resolved-output contract). On non-empty output, write the URL to `pr:`. On empty output (no PR exists), omit `pr:` silently — emit no warning. On non-zero exit, timeout, or other failure, omit `pr:` and emit the canonical warning.

Bitbucket authentication resolves in the same priority order used by `review-bb-pr`:

1. `BITBUCKET_BOT_USERNAME` + `BITBUCKET_BOT_TOKEN` (Basic auth).
2. `BITBUCKET_API_TOKEN` (Bearer auth).
3. macOS keychain: `security find-generic-password -a "$USER" -s "bitbucket-api-token" -w`.

If no credentials are configured, the dispatch fails — emit the canonical warning and omit `pr:` exactly as with any other failure.

## Failure handling rule

Resolution failure is **never** a hard error. Skills that embed this contract must:

1. Run the platform-appropriate snippet via the Bash tool with `timeout: 5000`.
2. On non-empty output, write the URL verbatim as the `pr:` frontmatter value.
3. On **empty output** (no PR exists for the branch — the lookup succeeded), omit the `pr:` line entirely (do not write `pr: null` or `pr: none`) and emit **no** warning. This is the normal pre-PR case.
4. On **failure** (non-zero exit, timeout, CLI/auth/network error, or any other failure mode), omit the `pr:` line entirely and emit the canonical warning in the agent's text output. Continue with the artifact write.

Empty output is **not** a failure. Distinguishing it from a true failure prevents misleading "PR lookup failed" warnings on every pre-PR artifact write.

The artifact is always written. The `pr:` field is best-effort metadata.
