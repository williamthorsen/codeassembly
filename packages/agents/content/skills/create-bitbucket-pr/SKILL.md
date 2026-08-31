---
name: create-bitbucket-pr
description: Create a Bitbucket pull request using the delegate interface from create-pr
user-invocable: false
---

# Create Bitbucket pull request

Internal delegate that creates a pull request on Bitbucket. Called by `create-pr` with fully prepared inputs; this skill does not resolve prefixes, labels, or scope/type.

## Delegate interface

This skill receives the following inputs from the orchestrator:

| Input               | Type     | Description                                                   |
| ------------------- | -------- | ------------------------------------------------------------- |
| `title`             | string   | Final PR title, already prefixed if applicable                |
| `body`              | string   | PR body extracted from `## What` onward in the change summary |
| `labels`            | string[] | Resolved label names (may be empty)                           |
| `base_branch`       | string   | Bare branch name (e.g., `main`, not `origin/main`)            |
| `ticket_id`         | string   | Ticket ID for artifact path resolution                        |
| `project_slug`      | string   | Project slug for artifact path resolution                     |
| `artifact_base_dir` | string   | Base directory for artifact storage                           |

## Process

### 1. Create the pull request

Call `action: "create"` on the tool named in [Bitbucket pull-request access](../_data/bitbucket-pr-access.md). No pull-request URL exists yet, so the coordinates come from that document's second source, the git remote.

- **Title**: Use `title` as provided.
- **Description**: Use `body` as provided.
- **Destination branch**: Use `base_branch`.
- **Draft/WIP**: Create as draft if the platform supports it.

### 2. Apply labels

If `labels` is non-empty, apply labels using whatever mechanism Bitbucket provides (e.g., labels API, metadata). If label application fails:

1. Record which labels failed.
2. Continue without the failing labels; the PR itself must still be created.
3. Report skipped labels in the completion output.

If Bitbucket does not support labels in the current context, skip label application silently.

### 3. Save PR artifact

Save a `pull-request` artifact in the ticket directory.

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Follow [artifact conventions](../_data/artifact-conventions.md).

`capture-lede-decision` reads this artifact later to recover the `## What` lede this pull request published, and it is the only record of that text once the description is revised. Where the lede is needed and the artifact does not carry it, that skill takes `--agent-lede-file`; the artifact is not edited to supply it.

Filename format:

```
{timestamp}_{slug}_pull-request.md
```

Artifact content:

```markdown
<!-- include: ../../_partials/seal-marker.md / -->

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
Labels applied: {list}                  <- only if labels were requested
Labels skipped: {list}                  <- only if any labels failed
Artifact saved: {artifact path}
```

Nothing else.
