---
name: review-bb-pr
description: Fetch Bitbucket PR metadata, verify HEAD, and resolve specification sources for review-pr
user-invocable: false
---

# Review Bitbucket pull request

Internal delegate that handles the Bitbucket-specific work for `review-pr`: Fetch PR metadata via the Bitbucket REST API, verify the local HEAD matches the PR's head commit, resolve the ticket (with body-parse fallback), and prepare the spec-source list. Returns a resolved-input record that `review-pr` passes to `review-branch`'s shared review process.

This skill does not run a review. The review logic lives in `review-branch`.

## Delegate interface

| Input                | Type           | Description                                       |
| -------------------- | -------------- | ------------------------------------------------- |
| `pr_id`              | string         | PR number (e.g., `"42"`) or full Bitbucket PR URL |
| `diff_base_override` | string \| null | `--diff-base` value from `review-pr` if provided  |
| `ticket_override`    | string \| null | `--ticket` value from `review-pr` if provided     |
| `project_slug`       | string         | From session context                              |
| `ticket_id`          | string \| null | From session context                              |
| `artifact_base_dir`  | string         | From session context                              |

## Resolved-output contract

On success, return a record with the same shape as `review-gh-pr`'s output. `review-pr` consumes both delegates' outputs interchangeably:

| Field            | Type                                                                            | Description                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge_base_sha` | string                                                                          | Result of `git merge-base HEAD <diff_base>`                                                                                                                                                                                                                                   |
| `diff_base`      | string                                                                          | Resolved ref (override if provided, else PR's destination branch)                                                                                                                                                                                                             |
| `spec_sources`   | array of `{ source_type, label, content, criteria?, provenance, last_updated }` | One entry per available specification source. Every source is `provenance: "remote"` (this path fetches live and never reads a local snapshot), so the review never renders a divergence note for it; `last_updated` is null when the platform does not expose it (e.g. Jira) |
| `pr_metadata`    | object                                                                          | `{ number, url, head_oid, base_ref, title }`                                                                                                                                                                                                                                  |

On HEAD mismatch, do not return — exit non-zero with the mismatch error. `review-pr` surfaces the message and stops.

## Bitbucket access

Use the same access mechanism as `bb-pr-inline-comment` — the Bitbucket Cloud REST API at `https://api.bitbucket.org/2.0/`. **Do not introduce a new client.** Authentication resolves in priority order:

1. **Bot credentials (Basic auth):** `BITBUCKET_BOT_USERNAME` + `BITBUCKET_BOT_TOKEN` env vars.
2. **API token (Bearer auth):** `BITBUCKET_API_TOKEN` env var.
3. **macOS keychain (Bearer auth):** `security find-generic-password -a "$USER" -s "bitbucket-api-token" -w`.

If no credentials are available, exit non-zero with the same auth-setup hint that `bb-pr-inline-comment` prints.

## Process

### 1. Normalize `pr_id` and detect workspace/repo

If `pr_id` is a URL of the form `https://bitbucket.org/{workspace}/{repo}/pull-requests/{number}`, extract `{workspace}`, `{repo}`, and `{number}`.

Otherwise treat `pr_id` as the number directly. Auto-detect workspace and repo from `git remote get-url origin` using the same parser as `bb-pr-inline-comment` (supports both `https://bitbucket.org/ws/repo` and `git@bitbucket.org:ws/repo.git`).

### 2. Fetch PR metadata

Issue a single Bitbucket REST call:

```
GET https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests/{pr_number}
```

Parse the JSON response with `jq` (or python3). Capture from the response:

- `id` (PR number), `title`, `description` (PR body), `links.html.href` (URL), `updated_on` (PR last-updated timestamp)
- `source.branch.name` (head branch name), `source.commit.hash` (full head commit SHA)
- `destination.branch.name` (base branch name)

If the API call fails (non-2xx), surface the response status and body and stop.

### 3. Verify HEAD

Compare the local HEAD against the PR's head commit:

```bash
local_head=$(git rev-parse HEAD)
```

If `local_head` does not equal `source.commit.hash`, exit non-zero with:

```
PR #{number}'s head commit is {short(source_commit_hash)} but HEAD is at {short(local_head)}. Check out the PR branch first (e.g., "git fetch origin pull-requests/{number}/from:pr-{number} && git checkout pr-{number}") or pull the latest commits on {source_branch_name}.
```

Use the first 7 characters for short SHAs. **Fail closed** — never proceed with mismatched state.

### 4. Resolve the diff base

Apply this cascade:

1. If `diff_base_override` is non-null, use it.
2. Otherwise, use `destination.branch.name` from PR metadata.

Compute the merge-base once:

```bash
merge_base_sha=$(git merge-base HEAD {diff_base})
```

### 5. Resolve the ticket

**Bitbucket linked-issues divergence from GitHub.** Bitbucket Cloud's PR API does not expose a structured `closingIssuesReferences` field equivalent to GitHub's. (Bitbucket has a separate Issues product with linked-issue support, but its surface differs and is not always enabled per workspace.) Rather than introducing a partial linked-issues mechanism here, this delegate uses a simpler cascade:

1. **`ticket_override`** — if non-null, resolve per [ticket source resolution](../_data/ticket-source-resolution.md) and use it.
2. **Parse PR body for issue references** — scan `description` for the first match of any of these patterns (case-insensitive):
   - `closes #{n}`, `closes: #{n}`
   - `fixes #{n}`, `fixes: #{n}`
   - `resolves #{n}`, `resolves: #{n}`
   - bare `#{n}`
   - Jira-style keys (e.g., `MAC-42`) when the project's `ticket_ref_prefix` is configured to a Jira prefix.

   Fetch the matched issue per [ticket source resolution](../_data/ticket-source-resolution.md).

3. **No ticket** — proceed with the PR description as the only spec source.

The divergence from `review-gh-pr` is intentional and documented here so future readers do not assume parity. If Bitbucket linked-issue parity is added later (via the Jira integration or a future Bitbucket API field), the cascade can grow a step 2 between override and body parse without breaking the delegate interface.

### 6. Build the spec-source list

Always include the PR description as a source:

```
{
  source_type: "pr_description",
  label: "pr_description: PR #{number}",
  content: <description>,
  criteria: <optional — extracted from `## What`, `## Summary`, or an explicit acceptance-criteria heading>,
  provenance: "remote",
  last_updated: <PR `updated_on`>
}
```

If a ticket was resolved in step 5, prepend it:

```
{
  source_type: "ticket",
  label: "ticket: {ticket_ref or short identifier}",
  content: <ticket body>,
  criteria: <optional — extracted from the ticket structure>,
  provenance: "remote",
  last_updated: <ticket last-updated when the platform exposes it (GitHub `updatedAt`); null when it does not (e.g. Jira)>
}
```

The list order is `[ticket?, pr_description]` — same as `review-gh-pr`.

### 7. Return the resolved-output record

```
{
  merge_base_sha: <from step 4>,
  diff_base: <from step 4>,
  spec_sources: <from step 6>,
  pr_metadata: {
    number: <id>,
    url: <links.html.href>,
    head_oid: <source.commit.hash>,
    base_ref: <destination.branch.name>,
    title: <title>
  }
}
```

`review-pr` passes this to `review-branch` and the review proceeds.

## Important

- **Single REST call for metadata.** All fields are fetched at once. Do not split into multiple calls.
- **HEAD mismatch is a hard stop.** The error message must include a Bitbucket-equivalent checkout suggestion so the user has a one-line fix path even though Bitbucket lacks `gh pr checkout`'s exact equivalent.
- **Linked-issues divergence is intentional.** The Bitbucket cascade lacks the GitHub `closingIssuesReferences` step. This is documented above so the parity gap is visible to future readers; do not silently re-add a partial implementation.
- **No review logic here.** This delegate prepares inputs only. The review process runs inside `review-branch` after `review-pr` invokes it with the resolved inputs.
