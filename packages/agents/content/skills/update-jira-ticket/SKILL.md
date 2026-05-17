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
5. **Never include `version_message`** as an argument. It is not a parameter of `update_jira_issue` or `create_jira_issue` — including it triggers a validation failure and a wasted retry.

## Allowed elements

Exhaustive list. Nothing else.

`h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `a`, `blockquote`, `hr`, `br`, `table`, `thead`, `tbody`, `tr`, `th`, `td`

**Always strip `<ac:*>` and `<ri:*>` constructs unconditionally.** These are Confluence storage-format extensions: `<ac:*>` for Confluence elements like task lists and structured macros (e.g., `<ac:task-list>`, `<ac:structured-macro>`); `<ri:*>` for resource identifiers (e.g., `<ri:user>`, `<ri:page>`, `<ri:attachment>`). They have no Jira analogue, and including them produces `INVALID_INPUT`. If you have been working with Confluence content in the same session, audit the payload before sending.

## Composition rules

These constraints govern how individually-allowed elements may be combined. Both elements may be valid on their own; the combination is rejected.

### `<code>` combined with other inline marks

Do not apply inline styling to `<code>` content. The following nesting patterns will be rejected, in **either** direction:

- `<strong><code>X</code></strong>` and `<code><strong>X</strong></code>`
- `<em><code>X</code></em>` and `<code><em>X</em></code>`
- `<a ...><code>X</code></a>` and `<code><a ...>X</a></code>`
- the same for `<strike>`, `<u>`, `<sub>`, `<sup>`

The rule is symmetric — flipping the nesting order is not a workaround.

**Why:** ADF represents inline styling as marks on text nodes, and the `code` mark is mutually exclusive with `strong`, `em`, `link`, `strike`, `underline`, `subsup`. Beyond the schema constraint, applying styling to monospace code has no defensible rendering — code is meant to display literal characters.

**Workaround:** Move the `<code>` outside the styling wrapper so the two apply to different text runs, or drop the styling entirely.

```html
<!-- Wrong -->
<strong><code>isDevMode</code> parameter</strong>

<!-- Right (separate text runs) -->
<strong>The </strong><code>isDevMode</code><strong> parameter</strong>

<!-- Also right (drop the styling) -->
<code>isDevMode</code> parameter
```

### Multi-line code samples

Do not wrap multi-line content in `<pre><code>`. The `<pre>` element is omitted from the allowlist entirely — multi-line `<pre><code>` blocks combining embedded newlines with quoted strings or apostrophes have been observed to trigger `INVALID_INPUT`.

**Why:** ADF's `codeBlock` node accepts plain text, but the converter mishandles the combination of newlines and quote characters inside the `pre` block. Inline `<code>` in `<p>` survives the same characters, so the `<pre>` wrapper is the differentiator.

**Workaround:** Render multi-line code as either multiple `<p><code>...</code></p>` paragraphs (one per logical line) or a single `<p>` with `<br>` separators between lines and inline `<code>` wrapping the code on each line. Single-line code is unchanged — continue to use inline `<code>` inside `<p>` or `<li>` as usual.

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
   - `skill`: Literal string `update-jira-ticket`.
   - `project_slug`: Basename of the repo root (or whatever convention the agent already uses for artefact paths in this session).
   - `failing_fragment`: The smallest payload fragment that reproduced `INVALID_INPUT`.
   - `notes`: Free-form. Name the suspected trigger class if recognisable, otherwise leave empty.

## Escalation criterion

If recorded failures concentrate in **known trigger classes** (named entities, `<ac:*>`, file-path mode) at frequency that costs real iterations, file a follow-up to add a deterministic sanitiser script to this skill — see [#467](https://github.com/williamthorsen/codeassembly/issues/467) for the prior decision and [#468](https://github.com/williamthorsen/codeassembly/issues/468) for the generic-logging follow-up.

If failures distribute across **unknown classes** (no clear pattern), the recovery protocol remains the right tool. A sanitiser would not help, since it can only enforce known rules.

## Antipatterns

- Hand-authoring HTML containing constructs outside the allowlist.
- Combining `<code>` with other inline marks on the same text run — see [Composition rules](#composition-rules).
- Using named HTML entities other than `&amp;`, `&lt;`, `&gt;`.
- Passing a file path to `description_html` / `comment_html`.
- Retrying past the 4-retry cap.
- Skipping the failure record after a recovery — this removes the evidence needed to decide whether to escalate.
