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

1. **Get session context** by invoking the bundled session-context deriver (`node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`) and reading the manifest JSON emitted on stdout. This JSON carries both `ticket_id` and the persisted `ticket_url` (see [Stored ticket URL](#stored-ticket-url)).

2. **Prefer the stored URL.** If `ticket_url` is a non-null string, fetch the ticket directly from that URL — skip the platform/identifier reconstruction below. If the stored URL does not yield the expected ticket, invalidate it per [Stored ticket URL](#stored-ticket-url) and continue with reconstruction.

3. **Otherwise reconstruct from `ticket_id`.** If `ticket_id` is `null`, auto-resolve fails — ask the user for a ticket source.

4. **Determine the platform and construct the fetch identifier:**

   a. Read `project.ticket_ref_prefix` from `.agents/preferences.yaml`.

   b. **If `ticket_id` is purely numeric** (e.g., `357`):
   - If `ticket_ref_prefix` is `#` or absent: The ID is a platform issue number. Determine the platform using the [platform resolution cascade](#platform-resolution-cascade). For GitHub, fetch issue `357`.
   - If `ticket_ref_prefix` is a Jira-style prefix (e.g., `MAC-`): The full Jira key is `{prefix}{number}` (e.g., `MAC-357`). The platform is Jira (or whichever platform hosts that project).

   c. **If `ticket_id` contains a prefix** (e.g., `MAC-42`): The ID is a Jira-style key. The platform is Jira (or whichever platform hosts that project).

   d. If the platform still cannot be determined, ask the user.

5. **Fetch the ticket** using the platform-specific command from [platform-specific fetch commands](#platform-specific-fetch-commands).

6. **Persist the resolved URL.** Once a ticket URL is in hand — whether reconstructed here, supplied by the user, or fetched — store it for future sessions per [Stored ticket URL](#stored-ticket-url).

### When auto-resolve fails

If the ticket ID is `null` or the platform cannot be determined, do not guess. Ask the user for an explicit ticket source. The cost of asking is low; the cost of fetching the wrong ticket is high.

A caller may substitute its own fallback for this "ask the user" terminal step when it has a sound default source. For example, `review-branch` falls back to the most recent local `*_ticket.md` snapshot instead of prompting, so an unattended review can still proceed against a reasonable contract.

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

Not yet supported for automated fetch. If the platform is determined to be Jira, present the Jira key to the user and ask them to provide the ticket content. The stored URL still applies: a Jira ticket URL the user supplied once is reused on later sessions (presented to the user) so it does not have to be re-pasted, and it is invalidated like any other stored URL when it does not yield the expected ticket — see [Stored ticket URL](#stored-ticket-url).

## Stored ticket URL

The branch manifest (`.agents/{branch}.branch-manifest.json`) persists a resolved `ticket_url` so it is reused across sessions instead of being reconstructed or re-pasted each time. The manifest is the single store; reads happen for free through the manifest JSON the deriver emits, and every write goes through the deriver's mutation flags — never by hand-editing the JSON.

- **Prefer** — auto-resolve uses a stored `ticket_url` before reconstructing one from `ticket_id`.
- **Persist** — after a ticket URL is resolved (reconstructed, supplied by the user, or fetched), store it: run `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-ticket-url "{url}"`.
- **Invalidate** — when the stored URL does not yield the expected ticket (the resource is not found at that URL — stale, wrong, moved, or deleted), clear it with `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --clear-ticket-url`, then re-resolve. This rule is platform-agnostic: there is no carve-out. For GitHub, re-resolution re-derives or re-fetches; for Jira, re-resolution re-prompts the user for a corrected URL (Jira has no automated fetch).

## Resolved metadata

After resolution, store the following metadata for use by the calling skill:

- **Platform** — which platform the ticket was resolved from (e.g., GitHub, Jira, file, plain text)
- **Repository** — the repository identifier (e.g., `owner/repo`), if applicable
- **Issue number** — the numeric identifier, if applicable
- **Last-updated date** — the ticket's last-modified timestamp, if available from the platform
- **Ticket content** — the title, body, labels, and any other retrieved fields
- **Ticket URL** — persisted across sessions in the branch manifest's `ticket_url` field, written through the deriver's mutation flags; see [Stored ticket URL](#stored-ticket-url)
