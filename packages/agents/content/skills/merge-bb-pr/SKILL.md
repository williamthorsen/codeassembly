---
name: merge-bb-pr
description: Merge a Bitbucket pull request using the delegate interface from merge-pr
user-invocable: false
---

# Merge Bitbucket pull request

Internal delegate that would merge a pull request on Bitbucket. Called by `merge-pr` with fully-resolved inputs.

**Bitbucket merge execution is not yet implemented.** This skill is a stub: The delegate interface is declared so the orchestrator can dispatch consistently across platforms, but the actual merge is left to the user.

## Delegate interface

| Input               | Type                            | Description                               |
| ------------------- | ------------------------------- | ----------------------------------------- |
| `pr_number`         | number                          | PR to merge                               |
| `title`             | string                          | Pre-rendered merge-commit title           |
| `body`              | string                          | Pre-composed merge-commit body            |
| `strategy`          | `squash` \| `merge` \| `rebase` | Concrete strategy (no `prompt` sentinel)  |
| `deletion_strategy` | `both` \| `remote` \| `none`    | Which branches to delete after merge      |
| `ticket_id`         | string                          | Ticket ID for artifact path resolution    |
| `project_slug`      | string                          | Project slug for artifact path resolution |
| `artifact_base_dir` | string                          | Base directory for artifact storage       |

## Process

Print a notice listing the resolved title, body, strategy, and deletion strategy, then exit successfully without invoking any Bitbucket API. The user merges manually using the Bitbucket UI or CLI.

```
Bitbucket merge is not yet implemented. Resolved values:

  PR:                 {pr_number}
  Title:              ▶︎ {title} ◀︎
  Strategy:           {strategy}
  Deletion strategy:  {deletion_strategy}

  ▼ Body
  {body}
  ▲

Merge manually via the Bitbucket UI, then re-run with `merge-pr` if you want a merge artifact saved locally.
```

Do not save a merge artifact; no merge has occurred. Exit with success.

## Completion

Notice rendered as above. No artifact saved. No API call made.
