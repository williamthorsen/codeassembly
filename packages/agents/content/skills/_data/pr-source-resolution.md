# PR source resolution

Resolve the pull-request URL a skill operates on at session start, and reuse it across sessions. Skills that act on "the PR for this branch" should use this shared resolution logic.

> **Scope: runtime discovery and reuse only.** This document covers how a skill _finds_ the PR URL at runtime: prefer a stored URL, otherwise discover one, persist what it resolves, and invalidate a stale stored URL. It does **not** cover the `pr:` frontmatter field. For who sets `pr:`, how it is written via `--override pr=<url>` to `resolve-frontmatter.sh`, and the rule that the field is best-effort and never blocks an artifact write, see [`pr-resolution.md`](pr-resolution.md).

## Stored PR URL

The branch manifest (`.agents/{branch}.branch-manifest.json`) persists a resolved `pr_url` so it is reused across sessions instead of being re-discovered each time. The manifest is the single store; reads happen for free through the manifest JSON the deriver emits, and every write goes through the deriver's mutation flags, never by hand-editing the JSON.

- **Seed**: On a `PR-<n>` branch identity, the deriver seeds `pr_url` at compose time by building the platform's PR URL shape from the git remote's `owner/repo` and the PR number (host and path from `scm` per [`pr-resolution.md`](pr-resolution.md); `null` when the remote cannot be resolved). This mirrors how the deriver seeds `ticket_url` from a base and id (see [Stored ticket URL](ticket-source-resolution.md#stored-ticket-url)). An explicitly stored URL overrides the seed.
- **Prefer**: Use a stored `pr_url` as the default before discovering one from the platform.
- **Persist**: After a PR URL is resolved, store it by running `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-pr-url "{url}"`.
- **Never on the default branch**: That branch belongs to no pull request, so a URL stored against it is whichever PR the last session happened to resolve. It is the stored default at step 2 of the runtime-resolution path below, which is how `merge-pr` with no `--pr` would come to merge an arbitrary PR. Reviewing someone else's PR from the default branch is ordinary, so this is a case that arises rather than a misuse. The deriver enforces it: It refuses the write, reports on stderr, exits 0, and emits a manifest whose `pr_url` is null, and it clears a value already stored there. `ticket_url` carries the same rule; see [Stored ticket URL](ticket-source-resolution.md#stored-ticket-url).
- **Invalidate**: When the stored URL does not yield the expected PR (the resource is not found at that URL, whether stale, wrong, moved, or deleted), clear it with `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --clear-pr-url`, then re-resolve. This rule is platform-agnostic: There is no carve-out.

## Runtime-resolution path (`review-pr`, `merge-pr`)

These skills discover a PR for the current branch at runtime. Resolve in this order:

1. **Explicit argument**: When the command supplies a PR (e.g., `review-pr <pr_id>` or `merge-pr --pr {n}`), use it. An explicit argument always overrides the stored URL.
2. **Stored URL**: Otherwise, if the manifest has a non-null `pr_url`, use it as the default.
3. **Discover from the platform**: Otherwise, look up the PR for the current branch, dispatching on `scm`:
   - **`"github"`**: `gh pr view --json number,title,body,labels,headRefName,baseRefName,url`.
   - **`"bitbucket"`**: The branch query in [Bitbucket pull-request access](bitbucket-pr-access.md#finding-the-pull-request-for-a-branch).

   If no PR is found, stop and direct the user to create one.

After resolving the URL by any of the three paths above, **persist** it per [Stored PR URL](#stored-pr-url). If a stored URL from step 2 does not yield the expected PR, **invalidate** it and fall through to step 3.

## `respond-to-review` path

`respond-to-review` does not discover a PR from the platform at runtime. Its PR URL comes from the sibling review artifact's `pr:` frontmatter.

- **When the review artifact has a `pr:` value:** Forward it to `resolve-frontmatter.sh` as `--override "pr={pr_url}"` (the frontmatter-field contract; see [`pr-resolution.md`](pr-resolution.md)), and additionally **persist** it via `--set-pr-url` so future sessions inherit it.
- **When the review artifact has no `pr:` field:** Fall back to the stored manifest `pr_url`, read from the manifest JSON the deriver already emitted during session-context setup.
