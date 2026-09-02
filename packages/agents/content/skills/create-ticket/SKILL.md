---
name: create-ticket
description: Create a ticket on the appropriate platform from conversation context
user-invocable: true
dependencies:
  skills:
    - testing-conventions
---

# Create ticket

Create a ticket on the appropriate platform. The remote platform (e.g., GitHub) is the source of truth for the ticket number. Local artifacts are saved after the remote ticket exists, using the platform-assigned ID.

## Arguments

| Argument              | Effect                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `--parent <ref>`      | Make the new ticket a child of the referenced ticket. One reference; a ticket has one parent. |
| `--blocked-by <refs>` | Mark the new ticket as blocked by the referenced tickets.                                     |
| `--blocking <refs>`   | Mark the new ticket as blocking the referenced tickets.                                       |

Each takes ticket references in the project's own form (`#1163`, `MAC-42`), comma-separated where more than one applies. All three are optional, and each overrides the inference in step 4 for its own relationship.

<!-- guidance-hook: ticketing-preferences -->

## Process

### 1. Resolve project metadata

Get `project_slug` and `artifact_base_dir` -- but NOT the new ticket's `ticket_id` (that comes from the platform in step 6).

- Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `project_slug`, `artifact_base_dir`, and `ticket_base_url` from the manifest JSON emitted on stdout
- From the same manifest JSON, also read `ticket_id` as `branch_ticket_id`, the ticket the current branch is derived from (empty when the branch encodes no ticket). The step-4 inference and the step-6 guard both read it; the new ticket's authoritative `ticket_id` still comes from the platform in step 6.
- Read `project.ticket_ref_prefix` from `.agents/preferences.yaml` (e.g., `CODY-`); if absent, default to empty string
- From the same file, read `integrations.jira.project_key` and `integrations.jira.issue_types`. Both are optional, and both are consumed only by step 6's Jira path, which states what each falls back to.

### 2. Write ticket content

Create the ticket body describing WHAT needs to be done: problem, context, and acceptance criteria. Do NOT include the plan inline. Do NOT include the ticket ID in the heading yet (it's not known until step 6).

```markdown
<!-- include: ../_partials/ticket-skeleton.md / -->
```

**Spike mode.** If the ticket describes a spike, use the spike ticket template in [spike conventions](../_data/spike-conventions.md) in place of the skeleton above.

<!-- include: ../_partials/ticket-skeleton-tiers.md / -->

<!-- include: ../_partials/ticket-concision.md / -->

<!-- include: ../../_partials/prose-line-breaks.md / -->

<!-- include: ../_partials/ticket-placement.md / -->

`create-ticket` produces no plan, so _the implementation_ is derived when the work is later planned; state the subject and outcomes, and leave mechanism for that step.

<!-- include: ../_partials/ticket-criteria-conventions.md / -->

Also draft the ticket string, per [`title-voice.md`](../_data/title-voice.md), for use in step 6.

### 3. Resolve platform

Determine where to create the remote ticket:

1. **Preferences**: Check `.agents/preferences.yaml` → `integrations`:

- If exactly one integration is enabled → use it
- If multiple enabled → ask

2. **Git remote**: if no integration is explicitly enabled:

- `git remote get-url origin` pointing to `github.com` → GitHub
- Other hosts → ask

3. **Ask**: if platform cannot be determined

### 4. Decide relationships

Three relationships are available, each stated from the new ticket's side:

- **parent**: The new ticket is a child of an existing ticket.
- **blocked-by**: The new ticket cannot proceed until an existing ticket lands.
- **blocking**: An existing ticket cannot proceed until the new ticket lands.

Decide which apply from the reason this ticket is being created, narrowed by `branch_ticket_id` (step 1): Work split out of the current branch's ticket relates to it, and a backlog idea raised in passing does not. An argument supplied by the caller replaces the inference for its own relationship.

**Most tickets have none, and that case is silent.** Where nothing applies, continue to step 5 without asking.

Where one or more apply, state each relationship and its target in the project's own reference form and confirm before anything is created, so a wrong target is visible while it is still free to correct. Where the platform resolved in step 3 cannot express one of them, say so here rather than leaving it to appear as a skip in step 7.

<!-- include: ../_partials/action-items.md / -->

### 5. Resolve labels (GitHub only)

If the platform resolved in step 3 is GitHub, attempt to read `.meta/label-map.json` using the Read tool. If the file does not exist, skip label resolution; no labels will be applied.

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

Missing entries are silently skipped: If a type or scope is not in the map, no label is added for that dimension.

Construct `--label` flags for each resolved label:

```bash
label_flags=""
# For each resolved label:
label_flags+=" --label \"{label_name}\""
```

### 6. Create remote ticket

Both platforms render the same title and persist the same branch association; only creation itself differs. Render the title, follow the path step 3 resolved, then finish at [Persist the branch association](#persist-the-branch-association).

#### Render the ticket title

Render with `describe-change.sh`. Ticket creation does **not** pass `--ticket-ref`; the new ticket has no ref yet (that's what this step assigns).

```bash
json=$({harness_home_dir}/scripts/describe-change.sh --title "{title}" --scope "{scope}" --type "{type}")
ticket_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ticket_title',''))")
```

Use a JSON parser (python3 above; `jq -r '.ticket_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes (`\"`), which a regex extractor would silently truncate.

Use `ticket_title` directly as the GitHub issue title or the Jira summary; it already includes any prefix (per the configured `ticket.title_format`) and the bare title text. If the script is not found, fall back to the bare `{title}`.

#### GitHub path

Write the body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern; do not inline the body into the shell command. Include `--label` flags if labels were resolved in step 5:

```bash
url=$(gh issue create --title "${ticket_title}" --body-file "$body_path"${label_flags})
```

Extract the issue number from the returned URL:

```bash
number=$(echo "$url" | grep -oE '[0-9]+$')
```

Construct the ticket ID from `ticket_ref_prefix` (step 1) and `number`:

- If `ticket_ref_prefix` is `#`: `ticket_id` = `{number}`; the `#` is display-only and is added only when forming `ticket_ref` (step 8), e.g. `147` → `#147`
- If `ticket_ref_prefix` is any other value (e.g., `MAC-`): `ticket_id` = `{ticket_ref_prefix}{number}` (e.g., `MAC-` + `147` → `MAC-147`)
- If no prefix: `ticket_id` = `{number}` (e.g., `147`)

#### Jira path

##### Resolve the project key

Take `integrations.jira.project_key` (step 1) where it is set. Otherwise derive the key from `project.ticket_ref_prefix` by stripping its trailing separator: `THOR-` yields `THOR`. Where neither is configured there is no project to create in; take the [no-remote fallback](#fallback-no-remote-platform), naming in the warning that neither `integrations.jira.project_key` nor `project.ticket_ref_prefix` is set. Never infer a key from the repository name or from a ticket reference seen elsewhere in the session.

##### Resolve the issue type

Read `integrations.jira.issue_types` (step 1) and stop at the first of these that yields a name:

1. The entry keyed by the work type established in the conversation context, matched against both the canonical keys and the aliases in [`work-types.json`](../_data/work-types.json). A map keyed `bugfix` answers a `fix` work type, and one keyed `fix` answers a `bugfix` type.
2. The map's `default` entry.
3. The literal `Task`.

Do not choose a type from the ticket's content. A team-managed project need not carry `Story` or `Bug`, and a name it does not carry fails the creation call.

##### Create the work item

Identify the client per {skill:update-jira-ticket}, which ranks the three client shapes and states the description format each one takes. Where it identifies none, take the [no-remote fallback](#fallback-no-remote-platform), naming the absent client in the warning.

Every client takes `ticket_title` as the summary, the resolved project key, the resolved issue type, and the step-2 body as the description in that skill's assigned format:

- **`contentFormat` tool** (e.g. `createJiraIssue`): `projectKey`, `issueTypeName`, `summary`, and `fields.description` with `contentFormat: "markdown"`.
- **HTML tool** (e.g. `create_jira_issue`): `description_html`, rendered to the allowlist and passed through that skill's pre-flight checker before the call.
- **`acli`**: convert the body to ADF, write the ADF to a scratch file, and pass the file:

  ```bash
  key=$(acli jira workitem create \
    --project "{project_key}" \
    --type "{issue_type}" \
    --summary "${ticket_title}" \
    --description-file "$adf_path" \
    --json | python3 -c "import sys,json; print(json.load(sys.stdin).get('key',''))")
  ```

  Where `--json` yields no `key`, re-read the key from the command's default output, which names the created work item.

  Where step 4 decided a parent, `--parent "{parent}"` joins this call; `acli` sets a parent nowhere else. Step 7's Jira path states the pre-flight that keeps a bad reference from costing the work item.

##### Record the identifiers

`ticket_id` is the returned key verbatim (e.g. `THOR-140`). The key already carries its project prefix, so the `ticket_ref_prefix` reconstruction the GitHub path performs does not apply here.

`url` is the URL the client returns. Where the client returns none, join `ticket_base_url` (step 1) to the key. Where neither yields one, the work item still exists: report it created by key with no URL, and skip the persist below.

#### Persist the branch association

Persist the new ticket's URL into the branch manifest so later sessions reuse it (see [ticket source resolution](../_data/ticket-source-resolution.md#stored-ticket-url)), but only when the new ticket belongs to the current branch. Compare `branch_ticket_id` (step 1) against the `ticket_id` the path above produced:

- When `branch_ticket_id` is empty (the branch encodes no ticket) or equals `ticket_id` (the branch is already linked to this ticket), persist:

  ```bash
  node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-ticket-url "$url"
  ```

- Otherwise the new ticket is a backlog/follow-up ticket created from an unrelated branch. Skip the persist so it does not clobber the branch → ticket link, and report the skip in the completion output, e.g. `Backlog ticket {ticket_id} created while on a branch linked to ticket {branch_ticket_id}; skipped branch-manifest association.`

Compare `ticket_id` rather than a bare issue number. `branch_ticket_id` comes from the same deriver logic that the GitHub path's construction mirrors, so the two agree in form on every project: bare where `ticket_ref_prefix` is `#` or absent, prefixed where it is a project key. Comparing a bare number holds only in the first case and silently skips every persist in the second.

Skip this section entirely where no URL was resolved; there is nothing to store.

### 7. Apply relationships

Skip this step when step 4 decided none.

Where no remote ticket exists (the [no-remote fallback](#fallback-no-remote-platform)), there is nothing to link. Skip every relationship step 4 decided, each with that as its reason, and report them. A relationship the user confirmed never disappears without a line in the completion output.

Otherwise apply relationships after the ticket exists rather than as part of creating it. A reference the platform rejects then costs the link alone; the same reference passed to the creation call would cost the ticket. One client forces the exception, and the Jira path below states what replaces the guarantee there.

#### GitHub path

One call applies every relationship decided:

```bash
gh issue edit "${number}" --parent "{parent}" --add-blocked-by "{blocked_by}" --add-blocking "{blocking}"
```

Omit any flag whose relationship step 4 did not decide. Each takes issue numbers or URLs, comma-separated for the two that accept several.

These flags are native to `gh` 2.94 and later. They are not the REST dependencies endpoint, which takes an issue's database `id` rather than its number; reaching for that endpoint is the detour this note exists to prevent.

#### Jira path

**Parent.** `acli jira workitem edit` carries no `--parent` flag, so on `acli` the parent goes on the step-6 creation call rather than after it. Pre-flight the reference first, which restores the guarantee the after-creation rule exists for:

```bash
acli jira workitem view "{parent}"
```

A non-zero exit means the reference is bad. Drop `--parent` from the creation call, create the work item without it, and report the parent as skipped; a reference Jira rejects then costs the relationship alone. A connected creation tool sets the parent through its own parent field on the same call, and where it exposes no such field the parent is reported skipped.

**blocked-by and blocking.** Both are Jira links, and `acli` is the only client that creates one; a connected creation tool exposes no link surface. Where `acli` is installed, create each link after the work item exists, whichever client created it:

```bash
acli jira workitem link create --out "{blocker}" --in "{blocked}" --type Blocks --yes
```

`--out` names the blocker, so the two relationships differ only in which side the new key occupies: blocked-by puts the referenced key in `--out`, and blocking puts the new key there. Reaching for `acli` here after creating through a connected tool costs nothing, because the creation client governs the description format and a link call carries no description.

Where `acli` is absent, report each link as skipped, naming the creation client as the one that cannot express it.

#### Other platforms

Use whatever the platform's own tooling offers for parent and blocking relationships.

#### When a relationship cannot be established

A relationship the platform cannot express, and a call that fails, are each recorded and skipped. Never abort the run over one: The ticket already exists by this point, and losing the link costs less than losing the ticket. Include every skipped relationship and its reason in the completion output; that report is how a platform's missing relationship surface becomes visible.

### 8. Save local artifacts

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

If a plan is also saved in step 9, it uses the same frontmatter shape with `provenance.skill: create-ticket`.

### Frontmatter resolution

The artifact's frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Source `$MODEL_ID` from your system-prompt environment block: the line `model named ... model ID is ...`.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill create-ticket --interactive true --model "$MODEL_ID" --override ticket_id="{ticket_id}" --override ticket_ref="{ticket_ref}"` via Bash, substituting the just-created ticket's `ticket_id` (step 6) and `ticket_ref` (computed above). Prepend the output verbatim to the artifact body.

The `--override` flags force the frontmatter to the new ticket's own `ticket_id`/`ticket_ref` (the same values its directory and `# {ticket_ref}:` heading use). Without them, `resolve-frontmatter.sh` resolves these from the current branch's manifest, so a ticket created from an unrelated branch would take the branch's id instead of its own. `branch` is left un-overridden so it stays as authoring provenance. This applies to both the ticket artifact (step 8) and the plan artifact (step 9).

Append `--extra copies_remote=true` to the ticket artifact's invocation, and to that one alone, where step 6 created a remote ticket. It records that the saved body is a copy of the ticket of record; see [ticket frontmatter](../_data/artifact-conventions.md#ticket-frontmatter). Omit it on the [no-remote fallback](#fallback-no-remote-platform) alone, which saves a snapshot with no ticket of record to copy.

### 9. Save plan (if present)

If a plan exists in conversation context, save it as a ticket-scoped artifact in the same directory:

```
{YYYYMMDD-HHMMSSZ}_{slug}_plan.md
```

Then attach it as a comment on the remote ticket, through the platform step 3 resolved.

**GitHub.** Write the comment body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern; do not inline the comment into the shell command:

```bash
gh issue comment {number} --body-file "$body_path"
```

**Jira.** Comment through the client that created the work item, in the format {skill:update-jira-ticket} assigns that client: a connected tool's own comment surface, or `acli` reading the comment as ADF from a scratch file.

```bash
acli jira workitem comment create --key "{ticket_id}" --body-file "$adf_path"
```

**Neither.** Where the client offers no comment surface, or the [no-remote fallback](#fallback-no-remote-platform) left nothing to comment on, the plan is saved locally alone. Report that in the completion output rather than passing over the attachment in silence.

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

If remote ticket creation fails or no platform is available, fall back to an auto-generated ticket ID: `{YYYYMMDD}-{4 random hex}` (e.g., `20260226-a3f2`). Save local artifacts using this ID. Log a warning that the remote ticket was not created, and report every relationship step 4 decided as skipped per step 7.

## Completion

```
Remote ticket created: {URL}               <- only if remote creation succeeded; {ticket_id} where no URL resolved
Ticket saved: {ticket artifact path}
Plan saved: {plan artifact path}           <- only if plan existed
Plan comment skipped: {reason}             <- only if a plan was saved but not attached
Relationships: {list}                      <- only if any were created
Relationships skipped: {list with reasons} <- only if any were skipped
Branch association skipped: {reason}       <- only when the step-6 guard skipped the persist
```

Nothing else.
