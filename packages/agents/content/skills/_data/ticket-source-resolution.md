# Ticket source resolution

Resolve a ticket source argument into ticket content and metadata. Skills that accept a ticket reference should use this shared resolution logic.

## Resolution table

| Input form                                                  | Resolution                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| URL to a known platform (GitHub, Jira, etc.)                | Use the platform CLI or a connected read tool if available; otherwise, fetch the URL content     |
| Other URL                                                   | Fetch the URL content                                                                            |
| Shorthand reference (`#99`, `issue 99`, `GitHub issue #99`) | Resolve platform (see below), then fetch per [platform-specific fetch](#platform-specific-fetch) |
| File path                                                   | Read the file                                                                                    |
| Plain text                                                  | Use as-is                                                                                        |
| _(no source provided)_                                      | Auto-resolve from environment (see [auto-resolve](#auto-resolve))                                |

**Persist the resolved URL.** After resolving by any form above (an explicitly supplied URL included, not only the auto-resolve path), store the resolved `ticket_url` in the branch manifest so later sessions reuse it without re-resolving or re-pasting. See [Stored ticket URL](#stored-ticket-url).

## Auto-resolve

When no ticket source is provided, attempt to derive the ticket from the current environment. This covers the common case where the branch name encodes the ticket identity (e.g., branch `357` for GitHub issue #357, or branch `MAC-42/feat/foo` for Jira ticket MAC-42).

### Steps

1. **Get session context** by invoking the bundled session-context deriver (`node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`) and reading the manifest JSON emitted on stdout. This JSON contains `ticket_id`, the persisted `ticket_url`, and `ticket_base_url` (the org-stable base mirrored from the `ticket.base_url` preference; see [Stored ticket URL](#stored-ticket-url)).

2. **Prefer the stored URL.** If `ticket_url` is a non-null string, fetch the ticket directly from that URL; skip the platform/identifier reconstruction below. If the stored URL does not yield the expected ticket, invalidate it per [Stored ticket URL](#stored-ticket-url) and continue with reconstruction.

3. **Otherwise reconstruct from `ticket_id`.** If `ticket_id` is `null`, auto-resolve fails; ask the user for a ticket source.

4. **Determine the platform and construct the fetch identifier:**

   a. Read `project.ticket_ref_prefix` from `.agents/preferences.yaml`.

   b. **If `ticket_id` is purely numeric** (e.g., `357`):
   - If `ticket_ref_prefix` is `#` or absent: The ID is a platform issue number. Determine the platform using the [platform resolution cascade](#platform-resolution-cascade). For GitHub, fetch issue `357`.
   - If `ticket_ref_prefix` is a Jira-style prefix (e.g., `MAC-`): The full Jira key is `{prefix}{number}` (e.g., `MAC-357`). The platform is Jira (or whichever platform hosts that project).

   c. **If `ticket_id` contains a prefix** (e.g., `MAC-42`): The ID is a Jira-style key. The platform is Jira (or whichever platform hosts that project).

   d. If the platform still cannot be determined, ask the user.

   e. **Construct the URL from a base when one is available.** If a base URL is known (`ticket_base_url` from the manifest, or `ticket.base_url` from `.agents/preferences.yaml`), the ticket URL is the base joined to `ticket_id` with a single `/` (e.g. `https://org.atlassian.net/browse/` + `MAC-42` → `https://org.atlassian.net/browse/MAC-42`). This is the reconstruction path for a Jira-style key: It yields the URL a URL-taking Jira read tool consumes, and the URL to present and persist where the content cannot be fetched.

5. **Fetch the ticket** per [platform-specific fetch](#platform-specific-fetch).

6. **Persist the resolved URL.** Once a ticket URL is in hand (whether reconstructed here, supplied by the user, or fetched), store it for future sessions per [Stored ticket URL](#stored-ticket-url).

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

## Platform-specific fetch

### GitHub

```
gh issue view --json number,title,body,labels,updatedAt {number}
```

Skills may request a subset of these fields. The `updatedAt` field is needed by skills that perform temporal analysis (e.g., staleness checks) and may be omitted by skills that only need the ticket content.

### Jira

Jira Cloud is reached through Atlassian's `acli`, falling back to a connected Jira read tool. Detect the CLI with `command -v acli`, and treat a non-zero exit from the fetch itself as unavailable: An `acli` that is installed but unauthenticated exits non-zero with an error on stderr and nothing on stdout, and that error does not distinguish an authentication failure from a missing issue, so fall through on the exit status rather than on the message.

**Preferred: `acli`.** Read the ticket body with the default view, which renders the description as text.

```
acli jira workitem view {key}
```

Where the source is a Jira URL rather than a key, the key is its `PROJECT-NUMBER` segment, which is the final segment of a `/browse/` URL.

Where a skill needs structured metadata, such as the `updated` timestamp for a staleness check, add `--json --fields '*navigable,-description'`. The `--json` flag returns the raw REST v3 response, in which the description is Atlassian Document Format rather than Markdown, so exclude it there and take the body from the default view. First-time setup is `acli jira auth login --web`, a browser flow that mints no API token.

**Fallback: a connected Jira read tool.** Tool names vary by server and by machine alias, so identify the tool by its parameters:

- **Takes an issue URL**: Pass the ticket URL. Prefer this shape where both are connected, since it needs no site resolution.
- **Takes an issue key and a cloud ID**: Resolve the cloud ID first, from the same server's tool listing accessible Atlassian sites. It is the `id` of the site whose URL matches the ticket URL's host, or of the sole site listed where no ticket URL is known. Where neither settles it, ask the user which site hosts the ticket. Resolve it once and reuse it for the rest of the session.

**Last resort.** Where neither is available, present the Jira key and ask the user for the ticket content. When `ticket.base_url` is configured, the ticket URL is reconstructed from the base and `ticket_id` (per [auto-resolve](#auto-resolve) step 4e), so it does not have to be supplied or re-pasted. A caller with a sound default source may substitute it for that prompt, as [When auto-resolve fails](#when-auto-resolve-fails) allows.

The stored URL applies throughout: A Jira ticket URL resolved once is reused on later sessions, and it is invalidated like any other stored URL when it does not yield the expected ticket (see [Stored ticket URL](#stored-ticket-url)).

## Stored ticket URL

The branch manifest (`.agents/{branch}.branch-manifest.json`) persists a resolved `ticket_url` so it is reused across sessions instead of being reconstructed or re-pasted each time. The manifest is the single store; reads happen for free through the manifest JSON the deriver emits, and every write goes through the deriver's mutation flags, never by hand-editing the JSON.

The manifest also surfaces `ticket_base_url`, mirroring the `ticket.base_url` preference. When a base and a `ticket_id` are both known, the deriver seeds `ticket_url` by joining them, so a bare Jira-style reference resolves to a URL without a supplied one. An explicitly stored URL always overrides that constructed default.

- **Prefer**: Auto-resolve uses a stored `ticket_url` before reconstructing one from `ticket_id`.
- **Persist**: After a ticket URL is resolved (reconstructed, supplied by the user, or fetched), store it by running `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-ticket-url "{url}"`.
- **Invalidate**: When the stored URL does not yield the expected ticket (the resource is not found at that URL, whether stale, wrong, moved, or deleted), clear it with `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --clear-ticket-url`, then re-resolve. This rule is platform-agnostic: There is no carve-out. For GitHub, re-resolution re-derives or re-fetches; for Jira, re-resolution re-fetches through `acli` or a connected read tool, and re-prompts the user only where neither is available.

## Resolved metadata

After resolution, store the following metadata for use by the calling skill:

- **Platform**: Which platform the ticket was resolved from (e.g., GitHub, Jira, file, plain text)
- **Repository**: The repository identifier (e.g., `owner/repo`), if applicable
- **Issue number**: The numeric identifier, if applicable
- **Last-updated date**: The ticket's last-modified timestamp, if available from the platform
- **Ticket content**: The title, body, labels, and any other retrieved fields
- **Ticket URL**: Persisted across sessions in the branch manifest's `ticket_url` field, written through the deriver's mutation flags; see [Stored ticket URL](#stored-ticket-url)
