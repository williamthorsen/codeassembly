---
name: create-ticket
description: Create a ticket on the appropriate platform from conversation context
user-invocable: true
---

# Create ticket

Create a ticket on the appropriate platform. The remote platform (e.g., GitHub) is the source of truth for the ticket number. Local artifacts are saved after the remote ticket exists, using the platform-assigned ID.

## Process

### 1. Resolve project metadata

Get `project_slug` and `base_dir` — but NOT `ticket_id` (that comes from the platform in step 5).

- Read `project.slug` from `.agents/preferences.yaml`; if absent, use `get-project-slug`
- Read `project.ticket_prefix` from `.agents/preferences.yaml` (e.g., `CODY-`); if absent, default to empty string
- Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`. If relative, resolve from project root. If absolute, use as-is.

### 2. Write ticket content

Create the ticket body describing WHAT needs to be done — problem, context, and acceptance criteria. Do NOT include the plan inline. Do NOT include the ticket ID in the heading yet (it's not known until step 5).

```markdown
## Description

{What needs to be done and why — the problem and its context}

## Acceptance criteria

### Must have

{Critical requirements}

### Should have

{Important but not blocking}

### Nice to have

{Optional enhancements}
```

Also draft a short title (without ticket ID prefix) for use in step 4.

### 3. Resolve platform

Determine where to create the remote ticket:

1. **Preferences** — check `.agents/preferences.yaml` → `integrations`:

- If exactly one integration is enabled → use it
- If multiple enabled → ask

2. **Git remote** — if no integration is explicitly enabled:

- `git remote get-url origin` pointing to `github.com` → GitHub
- Other hosts → ask

3. **Ask** — if platform cannot be determined

### 4. Create remote ticket

#### GitHub path

Create the issue **without** the ticket ID prefix in the title:

```bash
url=$(gh issue create --title "{scope}|{type}: {title}" --body "{ticket body}")
```

Extract the issue number from the returned URL:

```bash
number=$(echo "$url" | grep -oE '[0-9]+$')
```

Construct the ticket ID from `ticket_prefix` (step 1) and `number`:

- If `ticket_prefix` is configured: `ticket_id` = `{ticket_prefix}{number}` (e.g., prefix `MAC-` + `147` → `MAC-147`)
- If no prefix: `ticket_id` = `{number}` (e.g., `147`)

#### Jira path (stub)

If `integrations.jira.enabled: true`, note that Jira creation needs additional configuration. Skip to step 6 (save locally with an auto-generated ticket ID). Full Jira API support deferred.

### 5. Save local artifacts

Ticket directory: `{base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

`mkdir -p` the target directory before writing.

Save the ticket as a ticket-level artifact:

```
{YYYYMMDD-HHMMZ}_{slug}_ticket.md
```

The ticket artifact heading should include the ticket ID: `# {ticket_id}: {title}`.

Example: `20260226-2130Z_role-type-architecture_ticket.md`

Follow [artifact conventions](../_data/artifact-conventions.md).

### 6. Save plan (if present)

If a plan exists in conversation context, save it as a ticket-scoped artifact in the same directory:

```
{YYYYMMDD-HHMMZ}_{slug}_plan.md
```

Then attach it as a comment on the remote issue:

```bash
gh issue comment {number} --body "{plan comment}"
```

Plan comment format:

```markdown
**Implementation notes** (from planning session, {YYYY-MM-DD})

_These notes capture initial exploration and a proposed approach.
The implementer should verify assumptions and adapt as needed._

{plan content}

---

Plan artifact: `{saved plan path}`
```

### Fallback: no remote platform

If remote ticket creation fails or no platform is available, fall back to an auto-generated ticket ID: `{YYYYMMDD-HHMM}Z-{4 random alphanumeric}` (e.g., `20260226-2130Z-a3f2`). Save local artifacts using this ID. Log a warning that the remote ticket was not created.

## Completion

```
Issue created: {URL}                       <- only if remote creation succeeded
Ticket saved: {ticket artifact path}
Plan saved: {plan artifact path}           <- only if plan existed
```

Nothing else.
