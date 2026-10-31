---
name: create-gh-pr
description: Create a GitHub pull request using the delegate interface from create-pr
user-invocable: false
---

# Create GitHub pull request

Internal delegate that creates a pull request on GitHub. Called by `create-pr` with fully prepared inputs; this skill does not resolve prefixes, labels, or scope/type.

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
| `initial_state`     | string   | `draft` to open the pull request as a draft, `ready` to open it ready for review                       |

## Process

### 1. Construct label flags

If `labels` is empty, skip this step; the create call does not need any `--label` flags.

Otherwise render one `--label "{label_name}"` flag per label in the `labels` list, and write them into the create call below as literal text. A shell variable does not survive the Bash invocation that assigns it, so a call that reads one from an earlier call does not apply any labels at all.

### 2. Create the pull request

Write the body to a scratch file per [gh body file](#gh-body-file); do not inline the body into the shell command. Name it `gh-body-pr-{timestamp}.md`, since the PR does not have a number until this step returns one.

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
gh pr create \
  --title "{title}" \
  --body-file "$body_path" \
  --base "{base_branch}" \
  {draft_flag} \
  --assignee "@me" \
  {label_flags}
```

`{draft_flag}` is `--draft` when `initial_state` is `draft`, and is left out of the call entirely when it is `ready`. Write it into the call as literal text, as the label flags are.

`--assignee "@me"` assigns the pull request to the authenticated `gh` user, who is the developer creating it.

`gh pr create` prints the pull-request URL. Read it from the command's output and include it in step 5's artifact and the completion line; never capture it into a shell variable.

### 3. Handle label and assignee failures

If `gh pr create` fails and the error indicates that one or more labels are invalid, or that the assignee cannot be assigned:

1. Identify the failing labels, the assignee, or both from the error message.
2. Remove the failing `--label` flags, and remove `--assignee` if the assignee failed.
3. Retry `gh pr create` once without them, re-stating the `body_path` assignment and the guard for the same scratch file; do not rewrite the body or inline it.
4. Record which labels were skipped, and whether the assignee was skipped, with the reason from the error.

If the failure is unrelated to labels and the assignee, report the error and stop.

### 4. Read back the assignee

`gh` can create the pull request without applying an assignee that it cannot assign, so read the applied assignee from the created pull request rather than assuming it:

```bash
gh pr view {PR URL} --json assignees --jq '[.assignees[].login] | join(", ")'
```

An empty result means that the pull request has no assignee: Record the assignee as skipped, with the reason "not applied by GitHub" unless step 3 already recorded one.

### 5. Save PR artifact

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

URL: {PR URL returned by gh}
Created: {YYYY-MM-DD HH:MMZ}
Labels attempted: {comma-separated list, or "none"}
Labels applied: {comma-separated list, or "none"}
Labels skipped: {comma-separated list, or "none"}
Assignee: {login read back in step 4, or "none"}

## Body

{PR body as submitted, not as the pull request later reads}
```

## Completion

```
PR created: {URL}
Labels applied: {list}                  <- only if labels were requested
Labels skipped: {list}                  <- only if any labels failed
Assignee skipped: {reason}              <- only if the pull request has no assignee
Artifact saved: {artifact path}
```

Nothing else.

<!-- include: ../_partials/gh-body-file.md / -->
