# Ticket source resolution

Resolve a ticket source argument into ticket content and metadata. Skills that accept a ticket reference should use this shared resolution logic.

## Resolution table

| Input form                                                  | Resolution                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| URL to a known platform (GitHub, Jira, etc.)                | Use platform CLI if available; otherwise, fetch the URL content   |
| Other URL                                                   | Fetch the URL content                                             |
| Shorthand reference (`#99`, `issue 99`, `GitHub issue #99`) | Resolve platform (see below), then fetch via platform CLI         |
| File path                                                   | Read the file                                                     |
| Plain text                                                  | Use as-is                                                         |
| _(no source provided)_                                      | Auto-resolve from environment (see [auto-resolve](#auto-resolve)) |

## Auto-resolve

When no ticket source is provided, attempt to derive the ticket from the current environment. This covers the common case where the branch name encodes the ticket identity (e.g., branch `357` for GitHub issue #357, or branch `MAC-42/feat/foo` for Jira ticket MAC-42).

### Steps

1. **Get the ticket ID** by invoking the bundled session-context deriver (`node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs`) and reading `ticket_id` from the manifest JSON emitted on stdout. If `ticket_id` is `null`, auto-resolve fails — ask the user for a ticket source.

2. **Determine the platform and construct the fetch identifier:**

   a. Read `project.ticket_ref_prefix` from `.agents/preferences.yaml`.

   b. **If `ticket_id` is purely numeric** (e.g., `357`):
   - If `ticket_ref_prefix` is `#` or absent: The ID is a platform issue number. Determine the platform using the [platform resolution cascade](#platform-resolution-cascade). For GitHub, fetch issue `357`.
   - If `ticket_ref_prefix` is a Jira-style prefix (e.g., `MAC-`): The full Jira key is `{prefix}{number}` (e.g., `MAC-357`). The platform is Jira (or whichever platform hosts that project).

   c. **If `ticket_id` contains a prefix** (e.g., `MAC-42`): The ID is a Jira-style key. The platform is Jira (or whichever platform hosts that project).

   d. If the platform still cannot be determined, ask the user.

3. **Fetch the ticket** using the platform-specific command from [platform-specific fetch commands](#platform-specific-fetch-commands).

### When auto-resolve fails

If the ticket ID is `null` or the platform cannot be determined, do not guess. Ask the user for an explicit ticket source. The cost of asking is low; the cost of fetching the wrong ticket is high.

## Platform resolution cascade

Determine which platform a ticket belongs to:

1. Check `.agents/preferences.yaml` → `integrations` (if exactly one enabled, use it; if multiple, ask)
2. Check `git remote get-url origin` (e.g., `github.com` → GitHub)
3. Ask the user

This cascade is used by both [shorthand reference resolution](#shorthand-reference-resolution) and [auto-resolve](#auto-resolve).

## Shorthand reference resolution

Determine which platform `#99` refers to using the [platform resolution cascade](#platform-resolution-cascade).

## Platform-specific fetch commands

### GitHub

```
gh issue view --json number,title,body,labels,updatedAt {number}
```

Skills may request a subset of these fields. The `updatedAt` field is needed by skills that perform temporal analysis (e.g., staleness checks) and may be omitted by skills that only need the ticket content.

### Jira

Not yet supported for automated fetch. If the platform is determined to be Jira, present the Jira key to the user and ask them to provide the ticket content.

## Resolved metadata

After resolution, store the following metadata for use by the calling skill:

- **Platform** — which platform the ticket was resolved from (e.g., GitHub, Jira, file, plain text)
- **Repository** — the repository identifier (e.g., `owner/repo`), if applicable
- **Issue number** — the numeric identifier, if applicable
- **Last-updated date** — the ticket's last-modified timestamp, if available from the platform
- **Ticket content** — the title, body, labels, and any other retrieved fields
