---
name: review-gh-pr
description: Fetch GitHub PR metadata, verify HEAD, and resolve specification sources for review-pr
user-invocable: false
---

# Review GitHub pull request

Internal delegate that handles the GitHub-specific work for `review-pr`: fetch PR metadata in a single `gh pr view` call, verify the local HEAD matches the PR's head commit, resolve the ticket from PR linked issues (with body-parse fallback), and prepare the spec-source list. Returns a resolved-input record that `review-pr` passes to `review-branch`'s shared review process.

This skill does not run a review. The review logic lives in `review-branch`. This skill prepares inputs and verifies preconditions; it never produces findings, never saves a review artifact, and never calls anything beyond `gh` and `git`.

## Delegate interface

| Input                | Type           | Description                                                                          |
| -------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `pr_id`              | string         | PR number (e.g., `"1024"`) or full URL (`"https://github.com/owner/repo/pull/1024"`) |
| `diff_base_override` | string \| null | `--diff-base` value from `review-pr` if provided                                     |
| `ticket_override`    | string \| null | `--ticket` value from `review-pr` if provided                                        |
| `project_slug`       | string         | From session context                                                                 |
| `ticket_id`          | string \| null | From session context                                                                 |
| `artifact_base_dir`  | string         | From session context                                                                 |

## Resolved-output contract

On success, return a record with the following fields. `review-pr` passes this directly to `review-branch`:

| Field            | Type                                                  | Description                                                                                      |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `merge_base_sha` | string                                                | Result of `git merge-base HEAD <diff_base>`                                                      |
| `diff_base`      | string                                                | Resolved ref (override if provided, else `baseRefName`)                                          |
| `spec_sources`   | array of `{ source_type, label, content, criteria? }` | One entry per available specification source (PR description always present; ticket if resolved) |
| `pr_metadata`    | object                                                | `{ number, url, head_oid, base_ref, title }`                                                     |

On HEAD mismatch, do not return — exit non-zero with the mismatch error. `review-pr` surfaces the message and stops.

## Process

### 1. Normalize `pr_id`

If `pr_id` is a URL of the form `https://github.com/{owner}/{repo}/pull/{number}`, extract `{number}`. Otherwise treat `pr_id` as the number directly.

### 2. Fetch PR metadata

Issue a single `gh pr view` call with all fields needed downstream:

```bash
gh pr view {pr_number} --json number,title,body,url,headRefName,headRefOid,baseRefName,closingIssuesReferences
```

Parse the JSON with a real parser (`python3 -c "import sys,json; ..."` or `jq`). Capture:

- `number`, `title`, `body`, `url`
- `headRefName`, `headRefOid`, `baseRefName`
- `closingIssuesReferences` (array of `{ number, title, url }` or empty)

If `gh pr view` exits non-zero, surface its stderr and stop.

### 3. Verify HEAD

Compare the local HEAD against the PR's head commit:

```bash
local_head=$(git rev-parse HEAD)
```

If `local_head` does not equal `headRefOid`, exit non-zero with:

```
PR #{number}'s head commit is {short(headRefOid)} but HEAD is at {short(local_head)}. Run "gh pr checkout {number}" first.
```

Use the first 7 characters of each SHA for the short form. **Fail closed** — never proceed with mismatched state. Compilation, dependency installation, and test execution all require the working tree to match the commit being reviewed.

### 4. Resolve the diff base

Apply this cascade:

1. If `diff_base_override` is non-null, use it.
2. Otherwise, use `baseRefName` from PR metadata.

Compute the merge-base once:

```bash
merge_base_sha=$(git merge-base HEAD {diff_base})
```

Cache `merge_base_sha` for the resolved-output record.

### 5. Resolve the ticket

Apply this cascade in order; the first match wins:

1. **`ticket_override`** — if non-null, resolve per [ticket source resolution](../_data/ticket-source-resolution.md) and use it.
2. **First entry in `closingIssuesReferences`** — if the array is non-empty, fetch the first entry's content via `gh issue view --json number,title,body,labels {number}` and use it.
3. **Parse PR body for issue references** — scan `body` for the first match of any of these patterns (case-insensitive for keywords):
   - `closes #{n}`, `closes: #{n}`
   - `fixes #{n}`, `fixes: #{n}`
   - `resolves #{n}`, `resolves: #{n}`
   - bare `#{n}`

   Take the first match's number and fetch the issue via `gh issue view --json number,title,body,labels {number}`.

4. **No ticket** — proceed with the PR description as the only spec source.

### 6. Build the spec-source list

Always include the PR description as a source:

```
{
  source_type: "pr_description",
  label: "pr_description: PR #{number}",
  content: <body>,
  criteria: <optional — extracted bullets from `## What`, `## Summary`, or an explicit acceptance-criteria heading; null when no list is present>
}
```

If a ticket was resolved in step 5, prepend it:

```
{
  source_type: "ticket",
  label: "ticket: {ticket_ref or short identifier}",
  content: <ticket body>,
  criteria: <optional — extracted from the ticket structure>
}
```

The list order is `[ticket?, pr_description]` — when both are present, the ticket is listed first because the ticket is the higher-authority source (PR description is a presentation of what the implementation delivers; the ticket states what was asked).

### 7. Return the resolved-output record

Return:

```
{
  merge_base_sha: <from step 4>,
  diff_base: <from step 4>,
  spec_sources: <from step 6>,
  pr_metadata: { number, url, head_oid: headRefOid, base_ref: baseRefName, title }
}
```

`review-pr` passes this to `review-branch` and the review proceeds.

## Important

- **Single `gh pr view` call.** All fields are fetched at once. Do not split into multiple calls — repeated `gh` invocations are slow and add failure modes.
- **HEAD mismatch is a hard stop.** The error message must include the literal `gh pr checkout {number}` suggestion so the user has a one-line copy-pasteable fix.
- **Ticket-resolution cascade order is fixed.** `ticket_override` → `closingIssuesReferences[0]` → body parse → none. Document this order in any future change so future readers do not silently rearrange it.
- **No review logic here.** This delegate prepares inputs only. The review process — diff analysis, finding generation, "Specification compliance" rendering — runs inside `review-branch` after `review-pr` invokes it with the resolved inputs.
