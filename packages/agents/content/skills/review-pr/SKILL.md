---
name: review-pr
description: Review a pull request by detecting the platform, fetching PR metadata via a delegate, and running the shared branch-review process
user-invocable: true
---

# Review pull request

Review a pull request on the appropriate platform. Detects the platform, dispatches to a delegate (`{skill:review-gh-pr}` or `{skill:review-bb-pr}`) that fetches PR metadata, verifies HEAD matches the PR's head commit, and resolves specification sources, then invokes the shared review process from `{skill:review-branch}` with the resolved inputs.

This is a thin entry skill: The shared review logic — diff analysis, finding generation, "Specification compliance" rendering, artifact saving — lives in `review-branch`. Delegates own only the platform-specific work (PR-metadata fetch, HEAD verification, ticket resolution from PR linked issues, PR-description preparation). After the delegate returns its resolved inputs, this skill invokes `review-branch`'s review process with the prepared spec-source list and resolved diff base.

## Arguments

| Argument            | Description                                                                                                          | Default                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `<pr_id>`           | Positional. Full GitHub or Bitbucket PR URL, or a bare PR number. An explicit value always overrides the stored URL. | _(required unless a stored `pr_url` exists in the manifest)_ |
| `--diff-base=<ref>` | Override the diff base. Reviews `merge-base(HEAD, <ref>)..HEAD`.                                                     | The PR's `baseRefName` (or Bitbucket equivalent)             |
| `--ticket=<source>` | Override the auto-resolved ticket. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md).    | PR's first linked issue, then PR-body parse, then none       |

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `project_slug`, `ticket_id`, `ticket_ref`, `default_branch`, `artifact_base_dir`, `scm`, and `pr_url` from it. These values are carried forward into `review-branch`'s steps 4–9 (review header, scoring, saving) so that `review-branch`'s own step 1 does not need to re-run.

### 2. Resolve the PR

Resolve the PR to review per [PR source resolution](../_data/pr-source-resolution.md#runtime-resolution-path-review-pr-merge-pr): an explicit `<pr_id>` overrides; otherwise a stored `pr_url` from session context is the default; otherwise discover the PR for the current branch. Persist the resolved URL via `--set-pr-url`, and invalidate (`--clear-pr-url`) and re-resolve a stored URL that does not yield the expected PR. The resolved value is passed to the delegate as `pr_id` in step 5.

### 3. Detect platform

Apply the [platform resolution cascade](../_data/ticket-source-resolution.md#platform-resolution-cascade):

1. Check `.agents/preferences.yaml` → `integrations` (if exactly one is enabled, use it; if multiple, ask).
2. Check `git remote get-url origin` (`github.com` → GitHub; `bitbucket.org` → Bitbucket).
3. Ask the user.

If `<pr_id>` is a full URL, the URL host overrides the cascade — a `https://github.com/...` URL is GitHub regardless of preferences. Numeric `<pr_id>` inputs use the cascade-resolved platform.

### 4. Select delegate

| Platform                  | Delegate       |
| ------------------------- | -------------- |
| `github`                  | `review-gh-pr` |
| `bitbucket`               | `review-bb-pr` |
| Unknown after the cascade | Ask the user   |

### 5. Call delegate

Pass the following inputs to the selected delegate per its delegate interface:

| Input                | Value                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr_id`              | The PR resolved in step 2. The delegate parses and normalizes it (extracts the PR number from a URL when applicable; the Bitbucket delegate also auto-detects workspace/repo from `git remote get-url origin`). |
| `diff_base_override` | Value of `--diff-base` if provided; otherwise `null`                                                                                                                                                            |
| `ticket_override`    | Value of `--ticket` if provided; otherwise `null`                                                                                                                                                               |
| `project_slug`       | From session context                                                                                                                                                                                            |
| `ticket_id`          | From session context                                                                                                                                                                                            |
| `artifact_base_dir`  | From session context                                                                                                                                                                                            |

The delegate returns a resolved-input record:

| Field            | Type                                                                            | Description                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge_base_sha` | string                                                                          | Result of `git merge-base HEAD <diff-base>` after delegate-side resolution                                                                                                                                     |
| `diff_base`      | string                                                                          | The ref the delegate resolved against                                                                                                                                                                          |
| `spec_sources`   | array of `{ source_type, label, content, criteria?, provenance, last_updated }` | One entry per available specification source. `provenance`/`last_updated` are recorded so the review can state which contract it measured against; delegate-supplied sources are always `provenance: "remote"` |
| `pr_metadata`    | object (PR number, URL, head SHA, base ref, title)                              | Used by the review heading                                                                                                                                                                                     |

If the delegate exits with a HEAD-mismatch error (the PR's head commit is not the local HEAD), surface its error message and stop. Do not proceed with mismatched state.

### 6. Invoke the shared review process

Invoke `review-branch`'s review process with the resolved inputs:

- The diff base is `merge_base_sha` (already computed by the delegate).
- The spec-source list is `spec_sources` from the delegate. The "Specification compliance" section in the review output renders one subsection per entry. For a typical PR, this list contains both the ticket (when one was resolved) and the PR description as a `pr_description` source.
- The review heading uses `pr_metadata` to surface the PR number and URL alongside the ticket reference.

Invoke `review-branch`'s [Process](../review-branch/SKILL.md#process) starting at step 4 (read prior artifacts). Steps 1–3 of `review-branch` are already complete: Session context was gathered in step 1 above; `merge_base_sha` and `spec_sources` were resolved by the delegate.

### 7. Save and present next steps

`review-branch`'s saving and next-steps logic apply unchanged. The review artifact lands in the active run directory for the ticket (or a new `{timestamp}-interactive` run directory if none).

## Examples

### Review the PR for the current branch

```bash
# Check out the PR branch first, then review it.
gh pr checkout 1024
{skill:review-pr} 1024
```

### Review a PR by URL

```bash
gh pr checkout https://github.com/williamthorsen/codeassembly/pull/1024
{skill:review-pr} https://github.com/williamthorsen/codeassembly/pull/1024
```

### Review a stacked PR with a non-default diff base

```bash
gh pr checkout 1024
{skill:review-pr} 1024 --diff-base=feature/parent-branch
```

### Override the auto-resolved ticket

```bash
{skill:review-pr} 1024 --ticket=#553
```

## Important

- **Always check out the PR first.** The delegate compares `git rev-parse HEAD` to the PR's head commit and fails closed if they differ. The error message includes the platform-specific checkout command (e.g., `gh pr checkout <n>`).
- **The orchestrator owns no review logic.** All findings, scoring, and the "Specification compliance" rendering happen inside `review-branch`. This skill is platform detection + delegate dispatch + invocation of the shared review process.
- **Two specification sources by default.** Unlike `{skill:review-branch}` (one source: the ticket), `{skill:review-pr}` adds the PR description as a second source so the review evaluates the implementation against both. Source-vs-source divergence is reported in the `## Specification consistency` section of the review output (see `review-branch/SKILL.md`).
