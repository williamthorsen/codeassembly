# PR resolution

Shared contract for the `pr:` frontmatter field. `resolve-frontmatter.sh` does **not** resolve `pr:`; it has no network, MCP, `gh`, or `curl` access, and most artifacts are written before a PR exists. The field is a best-effort human backlink, populated only where a PR URL is genuinely in hand.

## Who sets `pr:`

A skill supplies the URL by passing `--override pr=<url>` to `resolve-frontmatter.sh`; the script writes it verbatim into the frontmatter and omits the field when no override is given. Only three writers hold a URL at the right moment:

- **`review-branch`** (when invoked via `review-pr`): sets `pr:` from the PR metadata `review-pr` resolved. In ticket-only / direct mode it holds no URL and omits the field.
- **`respond-to-review`**: Forwards `pr:` from the review artifact it responds to (that review has `pr:` when it was produced via `review-pr`). Omits it when the review has none.
- **`create-pr`**: After the PR is created and its URL is known, backfills `pr:` into the change summary it based the PR on.

Every other artifact-writing skill omits `pr:`; it holds no URL at write time. The PR-creation and merge artifacts record the URL as a prose line in their own bodies; they do not use frontmatter.

## URL formats

| Platform  | Format                                                        |
| --------- | ------------------------------------------------------------- |
| GitHub    | `https://github.com/{owner}/{repo}/pull/{n}` (not `/issues/`) |
| Bitbucket | `https://bitbucket.org/{workspace}/{repo}/pull-requests/{n}`  |

The PR-aware skills obtain the URL from the SCM directly (created by `gh pr create`, passed as a `pr_id` argument, or fetched from the API), so no interpolation is needed.

## Rule

`pr:` is best-effort metadata. A missing URL is never an error and never blocks an artifact write: The field is simply omitted.
