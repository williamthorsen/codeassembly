---
name: read-vibelassian-conversation
description: Read the conversation history for a Vibelassian task
user-invocable: true
---

# Read Vibelassian conversation

Retrieve and display the conversation history for a Vibelassian task, including task metadata and all comments from users and agents.

## Arguments

- `task-id` (required): The numeric task ID as shown in the Vibelassian UI (e.g., `44`)
- `author` (optional): Filter by author name (e.g., `review-agent`, `coder-agent`, `User`)
- `author-type` (optional): Filter by author type. Known values: `user`, `agent`
- `limit` (optional): Max number of comments to return (default: all)

## Database location

Resolve the SQLite database path in this order:

1. Use the `DATABASE_PATH` environment variable if set
2. Otherwise, use `~/repos/atlassian/team/vibelassian/src/database/database.sqlite`

## Process

1. **Verify database exists**: check that the resolved database file exists. If not, report an error:

   ```
   Error: Vibelassian database not found at {path}
   ```

2. **Fetch task metadata**: run the [context query](#context-query) to get task details. If no row is returned, report an error:

   ```
   Error: Task {task-id} not found in the Vibelassian database
   ```

3. **Fetch conversation**: run the [core query](#core-query), applying optional filters. If zero rows are returned, display:

   ```
   No messages found for task {task-id}.
   ```

4. **Display output** per the [output format](#output-format)

## Queries

### Context query

```bash
sqlite3 -json "{db_path}" "
SELECT
    t.id,
    t.title,
    t.status,
    t.bead_issue_id,
    t.git_branch,
    t.workspace_path,
    t.created_by,
    s.jira_key AS story_key,
    ra.agent_status,
    ra.worktree_path,
    ra.worktree_branch
FROM tasks t
LEFT JOIN stories s ON t.story_id = s.id
LEFT JOIN rovo_agents ra ON ra.task_id = t.id
WHERE t.id = {task_id};
"
```

### Core query

Build the query dynamically based on which optional arguments are provided:

```bash
sqlite3 -json "{db_path}" "
SELECT
    tc.id,
    tc.author,
    tc.author_type,
    tc.content,
    tc.created_at
FROM task_comments tc
WHERE tc.task_id = {task_id}
  /* append if author is specified: */
  AND tc.author = '{author}'
  /* append if author-type is specified: */
  AND tc.author_type = '{author_type}'
ORDER BY tc.created_at ASC
/* append if limit is specified: */
LIMIT {limit};
"
```

Omit the `AND` / `LIMIT` clauses when the corresponding argument is not provided.

**Input safety**: Use parameterized queries or sanitize argument values before interpolation. Do not pass unsanitized user input directly into SQL strings.

## Output format

Display the task metadata as a header, followed by the conversation as a chronological thread.

```markdown
## Task {id}: {title}

Status: {status} | Branch: {git_branch} | Story: {story_key}
Agent: {agent_status} | Worktree: {worktree_path}

### Conversation ({n} messages)

**{author}** ({author_type}) — {created_at}:

> {content, presented as a blockquote}

**{author}** ({author_type}) — {created_at}:

> {content, presented as a blockquote}
```

- Omit the `Story:` segment if `story_key` is null
- Omit the `Agent:` / `Worktree:` line if no `rovo_agents` row exists
- Each comment's content is Markdown-formatted; present it as-is inside a blockquote
- Separate each comment with a blank line
