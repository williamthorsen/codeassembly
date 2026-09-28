# PR resolution

Shared contract for the `pr:` frontmatter field. `resolve-frontmatter.sh` does **not** resolve `pr:`; it does not have network, MCP, `gh`, or `curl` access, and most artifacts are written before a PR exists. The field is a best-effort human backlink, populated only when a PR URL is genuinely available.

## Who sets `pr:`

A skill supplies the URL by passing `--override pr=<url>` to `resolve-frontmatter.sh`; the script writes it verbatim into the frontmatter and omits the field when the skill does not pass an override. Only two writers have a URL at the moment they compose frontmatter:

- **`review-branch`** (when invoked via `review-pr`): Sets `pr:` from the PR metadata resolved by `review-pr`. In ticket-only / direct mode it does not have a URL and omits the field.
- **`respond-to-review`**: Forwards `pr:` from the review artifact to which it responds (that review has `pr:` when it was produced via `review-pr`). Omits it when the review has none.

Every other artifact-writing skill omits `pr:`; it does not have a URL at write time. The PR-creation and merge artifacts record the URL as a prose line in their own bodies; they do not use frontmatter.

## URL formats

| Platform  | Format                                                        |
| --------- | ------------------------------------------------------------- |
| GitHub    | `https://github.com/{owner}/{repo}/pull/{n}` (not `/issues/`) |
| Bitbucket | `https://bitbucket.org/{workspace}/{repo}/pull-requests/{n}`  |

The PR-aware skills obtain the URL from the SCM directly (created by `gh pr create`, passed as a `pr_id` argument, or fetched from the API), so they do not need any interpolation.

## Rule

`pr:` is best-effort metadata. A missing URL is never an error and never blocks an artifact write: The field is simply omitted.
