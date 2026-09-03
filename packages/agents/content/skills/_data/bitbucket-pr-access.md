# Bitbucket pull-request access

Single access path for every skill that touches a Bitbucket pull request, whether it reads, creates, comments on, or merges one: `review-bb-pr`, `create-bitbucket-pr`, `merge-pr`, `merge-bb-pr`, and the review skills that post findings. One named tool and one field vocabulary keep them from each restating an access cascade or re-deriving the repository's coordinates.

## The tool

Every Bitbucket read and every Bitbucket write goes through the `bitbucketPullRequest` MCP tool, addressed by an `action` plus the coordinates below. There is no REST endpoint, no CLI, and no credential to configure: The tool carries its own connection, so no skill reads an environment variable, a keychain entry, or a token file.

Where the tool is not connected, stop with a stated reason naming it and the manual step the caller can take instead. Do not fall back to another client; none is supported.

```
The `bitbucketPullRequest` MCP tool is not connected, and it is the only Bitbucket access path. Connect the Bitbucket MCP server and re-run, or {manual step} in the Bitbucket UI.
```

## Coordinates

Every action takes `workspaceId` and `repoId`, both required, both accepting a slug. Resolve them once, at the first source that yields a pair:

1. **A pull-request URL already in hand.** A URL of the form `https://bitbucket.org/{workspace}/{repo}/pull-requests/{number}` carries both slugs and the PR number. `review-bb-pr` takes this path when its `pr_id` is that URL, and `merge-pr` takes it when its PR resolution produced a stored or discovered URL per [PR source resolution](pr-source-resolution.md). An explicit `merge-pr --pr {n}` or `review-pr {n}` is a bare number and yields no pair, so it falls through.
2. **The git remote.** Otherwise take them from `git remote get-url origin`: Strip a trailing `.git`, then take the two path segments following `bitbucket.org`, which either `/` or `:` separates from the host. This accepts the HTTPS form (`https://{user}@bitbucket.org/{workspace}/{repo}.git`) and the SSH form (`git@bitbucket.org:{workspace}/{repo}.git`) alike.

The second source exists because the tool exposes no "current repository" action and requires the pair on every call. It belongs here rather than in any skill: A skill states which source applies to it and links to this section, and never restates the parsing.

## Composing Markdown for Bitbucket

<!-- include: ../_partials/nested-list-indent.md / -->

The renderer is Python-Markdown, which is where the 4-space requirement comes from: The divergence from GFM is a dialect difference rather than a defect in this client. The tool round-trips the submitted Markdown byte for byte in `description.raw`, so a body that reads correctly there and renders wrong in the browser locates the fault in the renderer.

The same renderer reaches a merge commit message, since Bitbucket's commit list renders a commit message as Markdown. [BCLOUD-19083](https://jira.atlassian.com/browse/BCLOUD-19083) records that behavior, asking for a way to switch it off after Bitbucket displayed a `#`-prefixed commit title as a heading.

## Reading a pull request

`action: "get"` with `prId` returns the Bitbucket REST pull-request object verbatim. The fields these skills read:

| Field                         | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `id`                          | PR number                                                                            |
| `title`                       | PR title                                                                             |
| `description`                 | PR body, as raw Markdown                                                             |
| `state`                       | `OPEN`, `MERGED`, `DECLINED`, or `SUPERSEDED`                                        |
| `source.branch.name`          | Head branch name                                                                     |
| `source.repository.full_name` | Head repository as `{workspace}/{repo}`; differs from the resolved pair on a fork PR |
| `source.commit.hash`          | Head commit hash, which Bitbucket may abbreviate (see below)                         |
| `destination.branch.name`     | Base branch name                                                                     |
| `links.html.href`             | PR URL                                                                               |
| `updated_on`                  | Last-updated timestamp, ISO 8601                                                     |
| `merge_commit.hash`           | Merge commit hash; present once `state` is `MERGED`                                  |

Body text comes from `description` and nowhere else. `rendered.description` carries the same content as HTML, and `summary` carries a duplicate raw copy; either substituted for `description` publishes or reviews the wrong text.

**`source.commit.hash` is not a fixed width.** Bitbucket has been observed returning it abbreviated to 12 characters where `git rev-parse HEAD` returns 40. Compare on a prefix rather than on equality or on a fixed truncation: The platform's hash matches when it is a non-empty prefix of the local SHA and is at least 7 characters long. A shorter or empty hash fails the comparison rather than matching everything.

## Finding the pull request for a branch

`action: "list"` takes `state` and `q`, a Bitbucket query expression. To find the open pull request whose source is a given branch:

```
state: "OPEN"
q: 'source.branch.name = "{branch}"'
```

Take the single result's `id` and `links.html.href`. The URL is what [PR source resolution](pr-source-resolution.md#stored-pr-url) persists, so a discovery that yielded only the id would leave the caller to construct it. More than one open pull request from one source branch is possible; where the list returns several, ask which one rather than picking the first. An empty list means no open pull request exists for that branch.

This is the Bitbucket counterpart of `gh pr view` with no argument, which [PR source resolution](pr-source-resolution.md#runtime-resolution-path-review-pr-merge-pr) reaches when neither an explicit argument nor a stored URL supplied the pull request.

## Merging a pull request

`action: "merge"` with `prId` takes three further parameters:

| Parameter           | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `mergeStrategy`     | One of the strategy names below                                       |
| `message`           | The whole merge-commit message, title and body together in one string |
| `closeSourceBranch` | Whether to delete the source branch on the remote after the merge     |

Bitbucket Cloud offers six strategies. The three a caller needs:

| Caller's strategy | `mergeStrategy`       |
| ----------------- | --------------------- |
| `squash`          | `squash`              |
| `merge`           | `merge_commit`        |
| `rebase`          | `rebase_fast_forward` |

A repository can disable any strategy, and the tool exposes no list of the enabled ones. Do not pre-check: Pass the mapped value and surface the platform's own error, which names the strategy it refused.

`message` is a single field, unlike `gh pr merge`'s separate `--subject` and `--body`. Compose it as the title, a blank line, then the body.

The merge response's shape is not relied on. Read the merge commit hash from a follow-up `action: "get"`, which returns `merge_commit.hash` once `state` is `MERGED`. A caller reads `state` alongside the hash, so that an absent hash under a `MERGED` state is reported as a landed merge with the hash unavailable rather than as no merge.
