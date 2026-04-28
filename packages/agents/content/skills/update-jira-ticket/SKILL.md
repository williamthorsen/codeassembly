---
name: update-jira-ticket
description: 'Use whenever updating a Jira issue description or comment via the update_jira_issue MCP tool. Prevents the recurring INVALID_INPUT failure class by constraining HTML to a narrow allowlist and forbidding named entities, Confluence macros, and file-path mode.'
user-invocable: true
---

# Update Jira ticket

Use whenever calling `update_jira_issue` (or `create_jira_issue`) with `description_html` or `comment_html`. The MCP tool advertises a permissive HTML surface, but the payload is converted to Atlassian Document Format (ADF) before persistence and frequently rejects valid-looking HTML with an opaque `INVALID_INPUT` error. This skill prescribes the one path that avoids the known triggers.

## The one correct path

1. **Source content as Markdown.** Prefer a local Markdown artefact when one exists. Otherwise, compose in Markdown first — never author HTML directly.
2. **Convert Markdown to HTML using only the allowlist below.** Anything outside the allowlist must be omitted or rewritten.
3. **Pass the HTML inline** to `description_html` or `comment_html`.
4. **Never pass a file path** to `description_html` / `comment_html`. File-path mode is forbidden — it has been observed to fail with `INVALID_INPUT`.

## Allowed elements

Exhaustive list. Nothing else.

`h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `pre`, `a`, `blockquote`, `hr`, `br`, `table`, `thead`, `tbody`, `tr`, `th`, `td`

**Always strip `<ac:*>` constructs unconditionally.** These are Confluence storage-format extensions (e.g., `<ac:task-list>`, `<ac:structured-macro>`) and have no Jira analogue. Including them produces `INVALID_INPUT`. If you have been working with Confluence content in the same session, audit the payload before sending.

## Character handling

Use **literal Unicode** in HTML. Do not use named HTML entities outside the three universally-safe ones.

| Don't write | Write instead              |
| ----------- | -------------------------- |
| `&mdash;`   | `—` (U+2014)               |
| `&ndash;`   | `–` (U+2013)               |
| `&hellip;`  | `…` (U+2026)               |
| `&nbsp;`    | regular space, or `\u00a0` |
| `&copy;`    | `©` (U+00A9)               |
| `&rsquo;`   | `'` (U+2019)               |

Only `&amp;`, `&lt;`, `&gt;` are valid in payload text. `&quot;` and `&apos;` are valid only inside attribute values where they're needed to avoid clashing with the attribute's quote style.

## Recovery protocol (backstop)

Use only if `INVALID_INPUT` still fires after following the rules above.

1. **Probe.** Send `<p>ok</p>` as the entire payload. If this also fails, the problem is call shape, permissions, or the issue itself — not the payload. Stop and report.
2. **Bisect.** If `<p>ok</p>` succeeds, the failure is in the payload's content. Bisect the payload (split in half, test each half, recurse) to isolate the smallest fragment that still triggers `INVALID_INPUT`.
3. **Cap retries.** Do not exceed 4 retry attempts beyond the original failure. If the bisection has not converged by then, surface the smallest failing fragment to the user and stop.
4. **Record the failure.** Append a single JSON object (one line, no trailing comma) to `~/ai-artifacts/skill-failures/update-jira-ticket.jsonl`. Create the directory and file if absent.

   Required fields:

   ```json
   {
     "timestamp": "2026-04-28T03:15:32Z",
     "skill": "update-jira-ticket",
     "project_slug": "codeassembly",
     "failing_fragment": "<example>...</example>",
     "notes": "matched known trigger: <ac:task-list>"
   }
   ```

   - `timestamp`: ISO 8601 UTC.
   - `skill`: literal string `update-jira-ticket`.
   - `project_slug`: basename of the repo root (or whatever convention the agent already uses for artefact paths in this session).
   - `failing_fragment`: the smallest payload fragment that reproduced `INVALID_INPUT`.
   - `notes`: free-form. Name the suspected trigger class if recognisable, otherwise leave empty.

## Escalation criterion

If recorded failures concentrate in **known trigger classes** (named entities, `<ac:*>`, file-path mode) at frequency that costs real iterations, file a follow-up to add a deterministic sanitiser script to this skill — see [#467](https://github.com/williamthorsen/codeassembly/issues/467) for the prior decision and [#468](https://github.com/williamthorsen/codeassembly/issues/468) for the generic-logging follow-up.

If failures distribute across **unknown classes** (no clear pattern), the recovery protocol remains the right tool. A sanitiser would not help, since it can only enforce known rules.

## Antipatterns

- Hand-authoring HTML containing constructs outside the allowlist.
- Using named HTML entities other than `&amp;`, `&lt;`, `&gt;`.
- Passing a file path to `description_html` / `comment_html`.
- Retrying past the 4-retry cap.
- Skipping the failure record after a recovery — this removes the evidence needed to decide whether to escalate.
