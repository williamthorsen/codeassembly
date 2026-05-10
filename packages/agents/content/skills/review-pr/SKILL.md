---
name: review-pr
description: Review a pull request by detecting the platform, fetching PR metadata via a delegate, and running the shared branch-review process
user-invocable: true
---

# Review pull request

Review a pull request on the appropriate platform. Detects the platform, dispatches to a delegate (`review-gh-pr` or `review-bb-pr`) that fetches PR metadata, verifies HEAD matches the PR's head commit, and resolves specification sources, then invokes the shared review process from `review-branch` with the resolved inputs.

This is a thin entry skill: the shared review logic — diff analysis, finding generation, "Specification compliance" rendering, artifact saving — lives in `review-branch`. Delegates own only the platform-specific work (PR-metadata fetch, HEAD verification, ticket resolution from PR linked issues, PR-description preparation). After the delegate returns its resolved inputs, this skill invokes `review-branch`'s review process with the prepared spec-source list and resolved diff base.

## Arguments

| Argument            | Description                                                                                                               | Default                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `<pr_id>`           | Positional. PR number or full PR URL. URLs are parsed for `{owner}/{repo}#{number}` (GitHub) or the Bitbucket equivalent. | _(required)_                                           |
| `--diff-base=<ref>` | Override the diff base. Reviews `merge-base(HEAD, <ref>)..HEAD`.                                                          | The PR's `baseRefName` (or Bitbucket equivalent)       |
| `--ticket=<source>` | Override the auto-resolved ticket. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md).         | PR's first linked issue, then PR-body parse, then none |

## Process

### 1. Get session context

Use `get-session-context` to obtain `project_slug`, `ticket_id`, `artifact_base_dir`, and `platform`.

### 2. Detect platform

Apply the [platform resolution cascade](../_data/ticket-source-resolution.md#platform-resolution-cascade):

1. Check `.agents/preferences.yaml` → `integrations` (if exactly one is enabled, use it; if multiple, ask).
2. Check `git remote get-url origin` (`github.com` → GitHub; `bitbucket.org` → Bitbucket).
3. Ask the user.

If `<pr_id>` is a full URL, the URL host overrides the cascade — a `https://github.com/...` URL is GitHub regardless of preferences. Numeric `<pr_id>` inputs use the cascade-resolved platform.

### 3. Select delegate

| Platform                  | Delegate       |
| ------------------------- | -------------- |
| `github`                  | `review-gh-pr` |
| `bitbucket`               | `review-bb-pr` |
| Unknown after the cascade | Ask the user   |

### 4. Call delegate

Pass the following inputs to the selected delegate per its delegate interface:

| Input                | Value                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `pr_id`              | Normalized to platform-native id (number for GitHub; workspace/repo+number for Bitbucket) |
| `diff_base_override` | Value of `--diff-base` if provided; otherwise `null`                                      |
| `ticket_override`    | Value of `--ticket` if provided; otherwise `null`                                         |
| `project_slug`       | From session context                                                                      |
| `ticket_id`          | From session context                                                                      |
| `artifact_base_dir`  | From session context                                                                      |

The delegate returns a resolved-input record:

| Field            | Type                                                  | Description                                                                |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `merge_base_sha` | string                                                | Result of `git merge-base HEAD <diff-base>` after delegate-side resolution |
| `diff_base`      | string                                                | The ref the delegate resolved against                                      |
| `spec_sources`   | array of `{ source_type, label, content, criteria? }` | One entry per available specification source                               |
| `pr_metadata`    | object (PR number, URL, head SHA, base ref, title)    | Used by the review heading                                                 |

If the delegate exits with a HEAD-mismatch error (the PR's head commit is not the local HEAD), surface its error message and stop. Do not proceed with mismatched state.

### 5. Invoke the shared review process

Invoke `review-branch`'s review process with the resolved inputs:

- The diff base is `merge_base_sha` (already computed by the delegate).
- The spec-source list is `spec_sources` from the delegate. The "Specification compliance" section in the review output renders one subsection per entry. For a typical PR, this list contains both the ticket (when one was resolved) and the PR description as a `pr_description` source.
- The review heading uses `pr_metadata` to surface the PR number and URL alongside the ticket reference.

The skill **does not duplicate** the review logic; it delegates to `review-branch`'s [Process](../review-branch/SKILL.md#process) starting at step 4 (read prior artifacts), passing the already-resolved spec sources and merge-base SHA so the inner steps 1–3 are short-circuited by inputs.

### 6. Save and present next steps

`review-branch`'s saving and next-steps logic apply unchanged. The review artifact lands in the active run directory for the ticket (or a new `{timestamp}-interactive` run directory if none).

## Examples

### Review the PR for the current branch

```bash
# Implicit PR id when the current branch has exactly one open PR.
gh pr checkout 1024
/review-pr 1024
```

### Review a PR by URL

```bash
gh pr checkout https://github.com/williamthorsen/codeassembly/pull/1024
/review-pr https://github.com/williamthorsen/codeassembly/pull/1024
```

### Review a stacked PR with a non-default diff base

```bash
gh pr checkout 1024
/review-pr 1024 --diff-base=feature/parent-branch
```

### Override the auto-resolved ticket

```bash
/review-pr 1024 --ticket=#553
```

## Important

- **Always check out the PR first.** The delegate compares `git rev-parse HEAD` to the PR's head commit and fails closed if they differ. The error message includes the platform-specific checkout command (e.g., `gh pr checkout <n>`).
- **The orchestrator owns no review logic.** All findings, scoring, and the "Specification compliance" rendering happen inside `review-branch`. This skill is platform detection + delegate dispatch + invocation of the shared review process.
- **Two specification sources by default.** Unlike `/review-branch` (one source: the ticket), `/review-pr` adds the PR description as a second source so the review evaluates the implementation against both. A separate concern — calling out divergence between the ticket and the PR description as a specification-vs-specification check — is deferred (tracked separately).
