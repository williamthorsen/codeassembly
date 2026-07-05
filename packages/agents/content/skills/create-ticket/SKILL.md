---
name: create-ticket
description: Create a ticket on the appropriate platform from conversation context
user-invocable: true
---

# Create ticket

Create a ticket on the appropriate platform. The remote platform (e.g., GitHub) is the source of truth for the ticket number. Local artifacts are saved after the remote ticket exists, using the platform-assigned ID.

## Process

### 1. Resolve project metadata

Get `project_slug` and `artifact_base_dir` -- but NOT the new ticket's `ticket_id` (that comes from the platform in step 5).

- Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `project_slug` and `artifact_base_dir` from the manifest JSON emitted on stdout
- From the same manifest JSON, also read `ticket_id` as `branch_ticket_id`, the ticket the current branch is derived from (empty when the branch encodes no ticket). It is used only by the step-5 guard; the new ticket's authoritative `ticket_id` still comes from the platform in step 5.
- Read `project.ticket_ref_prefix` from `.agents/preferences.yaml` (e.g., `CODY-`); if absent, default to empty string

### 2. Write ticket content

Create the ticket body describing WHAT needs to be done — problem, context, and acceptance criteria. Do NOT include the plan inline. Do NOT include the ticket ID in the heading yet (it's not known until step 5).

```markdown
## Description

{What needs to be done and why — the problem and its context}

<!-- include: ../_partials/acceptance-criteria-scaffold.md / -->
```

<!-- include: ../_partials/ticket-concision.md / -->

<!-- include: ../_partials/ticket-placement.md / -->

`create-ticket` produces no plan, so _the implementation_ is derived when the work is later planned — state the subject and outcomes, and leave mechanism for that step.

Also draft a short title (without the `ticket_ref` prefix) for use in step 5.

### 3. Resolve platform

Determine where to create the remote ticket:

1. **Preferences** — check `.agents/preferences.yaml` → `integrations`:

- If exactly one integration is enabled → use it
- If multiple enabled → ask

2. **Git remote** — if no integration is explicitly enabled:

- `git remote get-url origin` pointing to `github.com` → GitHub
- Other hosts → ask

3. **Ask** — if platform cannot be determined

### 4. Resolve labels (GitHub only)

If the platform resolved in step 3 is GitHub, attempt to read `.meta/label-map.json` using the Read tool. If the file does not exist, skip label resolution — no labels will be applied.

The label map has this shape:

```json
{
  "types": { "feat": "feature", "fix": "fix", ... },
  "scopes": { "agents": "scope:agents", "factory": "scope:factory", ... }
}
```

If the file exists, resolve labels from the scope and type established in the conversation context:

1. **Type label:** Strip any trailing `!` from the type (e.g., `feat!` → `feat`). Look up the stripped type in `label_map.types`. If found, add the mapped label name.
2. **Breaking label:** If the original type had a `!` suffix, add `breaking` as an additional label.
3. **Scope label:** Look up the scope in `label_map.scopes`. If found, add the mapped label name.

Missing entries are silently skipped — if a type or scope is not in the map, no label is added for that dimension.

Construct `--label` flags for each resolved label:

```bash
label_flags=""
# For each resolved label:
label_flags+=" --label \"{label_name}\""
```

### 5. Create remote ticket

#### GitHub path

Render the ticket title using `describe-change.sh`. Note that ticket creation does **not** pass `--ticket-ref` — the new ticket has no ref yet (that's what this step assigns).

```bash
json=$({harness_home_dir}/scripts/describe-change.sh --title "{title}" --scope "{scope}" --type "{type}")
ticket_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ticket_title',''))")
```

Use a JSON parser (python3 above; `jq -r '.ticket_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes (`\"`), which a regex extractor would silently truncate.

Use `ticket_title` directly as the issue title — it already includes any prefix (per the configured `ticket.title_format`) and the bare title text. If the script is not found, fall back to the bare `{title}`.

Write the body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern — do not inline the body into the shell command. Include `--label` flags if labels were resolved in step 4:

```bash
url=$(gh issue create --title "${ticket_title}" --body-file "$body_path"${label_flags})
```

Extract the issue number from the returned URL:

```bash
number=$(echo "$url" | grep -oE '[0-9]+$')
```

Construct the ticket ID from `ticket_ref_prefix` (step 1) and `number`:

- If `ticket_ref_prefix` is `#`: `ticket_id` = `{number}`; the `#` is display-only and is added only when forming `ticket_ref` (step 6), e.g. `147` → `#147`
- If `ticket_ref_prefix` is any other value (e.g., `MAC-`): `ticket_id` = `{ticket_ref_prefix}{number}` (e.g., `MAC-` + `147` → `MAC-147`)
- If no prefix: `ticket_id` = `{number}` (e.g., `147`)

Persist the new issue URL into the branch manifest so later sessions reuse it (see [ticket source resolution](../_data/ticket-source-resolution.md#stored-ticket-url)), but only when the new ticket belongs to the current branch. Compare `branch_ticket_id` (step 1) against the bare issue `number` extracted above:

- When `branch_ticket_id` is empty (the branch encodes no ticket) or equals `number` (the branch already owns this ticket), persist:

  ```bash
  node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-ticket-url "$url"
  ```

- Otherwise the new ticket is a backlog/follow-up ticket created from an unrelated branch. Skip the persist so it does not clobber the branch → ticket link, and report the skip in the completion output, e.g. `Backlog ticket #{number} created while on a branch owning ticket {branch_ticket_id}; skipped branch-manifest association.`

Compare the bare `number`, not the constructed `ticket_id`: GitHub uses the `#` (or empty) `ticket_ref_prefix`, for which `branch_ticket_id` is the bare issue number and compares directly against `number`. The Jira path persists nothing, so this guard applies only to the GitHub path.

#### Jira path (stub)

If `integrations.jira.enabled: true`, note that Jira creation needs additional configuration. Skip to step 7 (save locally with an auto-generated ticket ID). Full Jira API support deferred. The Jira stub holds no URL yet, so it persists nothing new — consistent with today.

### 6. Save local artifacts

Compute `ticket_ref` for the heading from `ticket_id` and `ticket_ref_prefix` (both already in scope from step 1) using the same logic the bundled deriver applies:

- If `ticket_ref_prefix == '#'`: `ticket_ref = '#' + ticket_id`
- Otherwise: `ticket_ref = ticket_id`

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

`mkdir -p` the target directory before writing.

Save the ticket as a ticket-level artifact:

```
{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md
```

The artifact begins with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema. Resolve fields per [Frontmatter resolution](#frontmatter-resolution) below. The body heading should include the ticket reference: `# {ticket_ref}: {title}`. On a GitHub-style project (`ticket_ref_prefix: '#'`) with issue number `461`, this renders as `# #461: {title}`.

Example: `20260226-213000Z_role-type-architecture_ticket.md`

If a plan is also saved in step 7, it uses the same frontmatter shape with `provenance.skill: create-ticket`.

### Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill create-ticket --interactive true --model "$MODEL_ID" --override ticket_id="{ticket_id}" --override ticket_ref="{ticket_ref}"` via Bash, substituting the just-created ticket's `ticket_id` (step 5) and `ticket_ref` (computed above). Prepend the output verbatim to the artifact body.

The `--override` flags force the frontmatter to the new ticket's own `ticket_id`/`ticket_ref` (the same values its directory and `# {ticket_ref}:` heading use). Without them, `resolve-frontmatter.sh` resolves these from the current branch's manifest, so a ticket created from an unrelated branch would carry the branch's id instead of its own. `branch` is left un-overridden so it stays as authoring provenance. This applies to both the ticket artifact (step 6) and the plan artifact (step 7).

### 7. Save plan (if present)

If a plan exists in conversation context, save it as a ticket-scoped artifact in the same directory:

```
{YYYYMMDD-HHMMSSZ}_{slug}_plan.md
```

Then attach it as a comment on the remote issue. Write the comment body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern — do not inline the comment into the shell command:

```bash
gh issue comment {number} --body-file "$body_path"
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

### Fallback: No remote platform

If remote ticket creation fails or no platform is available, fall back to an auto-generated ticket ID: `{YYYYMMDD}-{4 random hex}` (e.g., `20260226-a3f2`). Save local artifacts using this ID. Log a warning that the remote ticket was not created.

## Completion

```
Issue created: {URL}                       <- only if remote creation succeeded
Ticket saved: {ticket artifact path}
Plan saved: {plan artifact path}           <- only if plan existed
Branch association skipped: {reason}       <- only when the step-5 guard skipped the persist
```

Nothing else.
