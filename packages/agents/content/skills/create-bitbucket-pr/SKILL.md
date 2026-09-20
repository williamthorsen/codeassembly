---
name: create-bitbucket-pr
description: Create a Bitbucket pull request using the delegate interface from create-pr
user-invocable: false
---

# Create Bitbucket pull request

Internal delegate that creates a pull request on Bitbucket. Called by `create-pr` with fully prepared inputs; this skill does not resolve prefixes, labels, or scope/type.

## Delegate interface

This skill receives the following inputs from the orchestrator:

| Input               | Type     | Description                                                                                            |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `title`             | string   | Final PR title, already prefixed if applicable                                                         |
| `body`              | string   | PR body: `## What` onward from the change summary, then the closing line and the `change-record` block |
| `labels`            | string[] | Resolved label names (may be empty)                                                                    |
| `base_branch`       | string   | Bare branch name (e.g., `main`, not `origin/main`)                                                     |
| `ticket_id`         | string   | Ticket ID for artifact path resolution                                                                 |
| `project_slug`      | string   | Project slug for artifact path resolution                                                              |
| `artifact_base_dir` | string   | Base directory for artifact storage                                                                    |

## Process

### 1. Create the pull request

Call `action: "create"` on the tool named in [Bitbucket pull-request access](../_data/bitbucket-pr-access.md). No pull-request URL exists yet, so the coordinates come from that document's second source, the git remote.

- **Title**: Use `title` as provided.
- **Description**: Use `body` as provided.
- **Source branch**: Use the current branch, `git rev-parse --abbrev-ref HEAD`. The action requires it, and the delegate interface has no head-branch input.
- **Destination branch**: Use `base_branch`.
- **Draft/WIP**: Create as draft if the platform supports it.

### 2. Report every label as skipped

Bitbucket pull requests have no labels, and the tool exposes no label parameter on any action. Attempt no call. Report every name in `labels` under `Labels skipped:` in the completion output, and leave `Labels applied:` as `none`.

Labels matter to `merge-pr` only for a PR whose body contains no readable `change-record` block, and a Bitbucket PR contributes none there; this step makes that true.

The artifact's label lines keep `create-gh-pr`'s three-field shape: `Labels attempted:` lists the requested set, `Labels applied:` is always `none`, and `Labels skipped:` repeats the requested set.

### 3. Save PR artifact

Save a `pull-request` artifact in the ticket directory.

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Follow [artifact conventions](../_data/artifact-conventions.md).

When the lede is needed and the artifact does not contain it, `capture-lede-decision` takes `--agent-lede-file`; the artifact is not edited to supply it.

Filename format:

```
{timestamp}_{slug}_pull-request.md
```

Artifact content:

```markdown
<!-- include: ../../_partials/record-marker.md / -->

# {title}

URL: {PR URL}
Created: {YYYY-MM-DD HH:MMZ}
Labels attempted: {comma-separated list, or "none"}
Labels applied: {comma-separated list, or "none"}
Labels skipped: {comma-separated list, or "none"}

## Body

{PR body as submitted, not as the pull request later reads}
```

## Completion

```
PR created: {URL}
Labels skipped: {list}                  <- only if labels were requested
Artifact saved: {artifact path}
```

Nothing else.
