---
name: update-jira-ticket
description: 'Use whenever updating a Jira issue description or comment, with either the contentFormat-based tool (editJiraIssue, taking fields.description plus contentFormat markdown/adf) or the HTML-based tool (update_jira_issue, taking description_html / comment_html). The HTML tool needs the bundled pre-flight checker to catch INVALID_INPUT triggers (composition rules, named entities, Confluence macros, multi-line <pre>, disallowed elements) before any MCP round-trip; the contentFormat tool takes Markdown directly.'
user-invocable: true
---

# Update Jira ticket

Two different MCP tool shapes update Jira issues, and they need opposite handling. One takes Markdown (or ADF) directly and needs no sanitization; the other takes HTML that Jira converts to Atlassian Document Format (ADF), a conversion that frequently rejects valid-looking HTML with an opaque `INVALID_INPUT` error. Identify which tool you have, then follow that branch.

## Identify which tool you have

Inspect your available MCP tools and match the shape:

- **`contentFormat`-based tool**: e.g. `editJiraIssue` (Atlassian Rovo): takes `fields.description` together with `contentFormat: "markdown" | "adf"`. No HTML surface. → Follow the [Markdown path](#markdown-path).
- **`description_html`-based tool**: `update_jira_issue` / `create_jira_issue` with `description_html` / `comment_html`. → Follow the [HTML path](#html-path).

If both are available, prefer the `contentFormat` tool: The Markdown path is simpler and cannot trigger the HTML→ADF failure classes.

## Markdown path

Use this branch when a `contentFormat`-based tool (e.g. `editJiraIssue`) is available.

1. **Author Markdown.** Prefer a local Markdown artefact when one exists; otherwise compose in Markdown. Pass it via `contentFormat: "markdown"`.
2. **Prefer Markdown over ADF.** Reserve `contentFormat: "adf"` for content whose fidelity Markdown cannot express (panels, status lozenges, expand blocks, layout columns). ADF is full-fidelity JSON but verbose and harder to author, so use it only when Markdown genuinely falls short.
3. **Write checklists as plain bullets.** Jira's Markdown converter does not map `- [ ]` / `- [x]` to ADF task items. It escapes the brackets, so the line persists as a bullet reading `\[ \] ...`. Convert task-list syntax to plain `-` bullets before submitting, including when the source is a local artefact that uses checkboxes, as ticket artefacts from `design-and-plan` and `create-ticket` do. Native checkboxes exist only as ADF `taskList` / `taskItem` nodes, and `contentFormat` applies to the whole field rather than a section of it, so a checklist never justifies authoring the entire description as ADF.
4. **Do not sanitize.** The HTML allowlist, the composition rules, and the pre-flight checker under [HTML path](#html-path) **do not apply** here, and you must **not** run `update-jira-ticket.mjs`. Those rules exist solely to survive Jira's HTML→ADF conversion, and that converter is never invoked when you submit Markdown or ADF, so there is nothing for them to guard against. Rendering content to allowlist HTML and running the checker on this path is wasted work.

That is the entire path. Everything under [HTML path](#html-path) is irrelevant when a `contentFormat` tool is available.

## HTML path

Use this branch only when the available tool is the HTML-surface `update_jira_issue` / `create_jira_issue` (with `description_html` or `comment_html`). The MCP tool advertises a permissive HTML surface, but the payload is converted to Atlassian Document Format (ADF) before persistence, and that conversion frequently rejects valid-looking HTML with an opaque `INVALID_INPUT` error. This branch prescribes the one path that avoids the known triggers, backed by a deterministic pre-flight checker.

### The correct path for the HTML tool

1. **Source content as Markdown.** Prefer a local Markdown artefact when one exists. Otherwise, compose in Markdown first; never author HTML directly.
2. **Convert Markdown to HTML using only the allowlist below.** Anything outside the allowlist must be omitted or rewritten. Task-list syntax (`- [ ]` / `- [x]`) becomes a plain `<li>`; never pass the brackets through as literal text.
3. **Run the pre-flight checker against the rendered HTML.** Fix everything it flags, then re-run until it returns `ok: true`. See [Pre-flight checker](#pre-flight-checker) for the contract.
4. **Pass the HTML inline** to `description_html` or `comment_html`.
5. **Never pass a file path** to `description_html` / `comment_html`. File-path mode is forbidden: It has been observed to fail with `INVALID_INPUT`.
6. **Never include `version_message`** as an argument. It is not a parameter of `update_jira_issue` or `create_jira_issue`; including it triggers a validation failure and a wasted retry.

### Pre-flight checker

A bundled helper at `{harness_home_dir}/skills/update-jira-ticket/update-jira-ticket.mjs` validates the rendered HTML against every known failure class. The agent invokes it before every `update_jira_issue` / `create_jira_issue` call.

#### Invocation

Pipe the HTML on stdin; the helper writes a JSON result to stdout and exits 0 in both the pass and fail cases (only invocation errors exit non-zero).

```bash
cat <<'EOF' | node "$(dirname "$SKILL_PATH")/update-jira-ticket.mjs"
<p>Your rendered HTML payload here.</p>
EOF
```

Or, when the skill directory is known:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/update-jira-ticket/update-jira-ticket.mjs
<p>Your rendered HTML payload here.</p>
EOF
```

#### Output

`ok: true` means the payload passes every rule:

```json
{ "ok": true }
```

`ok: false` includes a `findings` array. Each finding identifies the rule, the offending source snippet, the 1-based line (when derivable), and a suggested fix:

```json
{
  "ok": false,
  "findings": [
    {
      "rule": "composition-code-inline-mark",
      "snippet": "<strong>...<code>",
      "line": 12,
      "fix": "Move the <code> outside <strong>, or drop the inline mark."
    }
  ]
}
```

The rule classes are: `composition-code-inline-mark`, `named-entity`, `confluence-construct`, `pre-multiline`, `disallowed-element`. The same payload may emit multiple findings; fix them all before the next MCP attempt.

#### Acting on findings

For each finding, apply the suggested fix to the source. Do not invoke `update_jira_issue` / `create_jira_issue` until the checker returns `ok: true`. Findings are not optional: Every rule corresponds to a documented `INVALID_INPUT` trigger.

### Allowed elements

Exhaustive list. Nothing else.

`h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `a`, `blockquote`, `hr`, `br`, `table`, `thead`, `tbody`, `tr`, `th`, `td`

**Always strip `<ac:*>` and `<ri:*>` constructs unconditionally.** These are Confluence storage-format extensions: `<ac:*>` for Confluence elements like task lists and structured macros (e.g., `<ac:task-list>`, `<ac:structured-macro>`); `<ri:*>` for resource identifiers (e.g., `<ri:user>`, `<ri:page>`, `<ri:attachment>`). They have no Jira analogue, and including them produces `INVALID_INPUT`. If you have been working with Confluence content in the same session, audit the payload before sending; the checker will catch any that slip through.

### Composition rules (reference)

The pre-flight checker enforces these; this section explains why they exist.

#### `<code>` combined with other inline marks

`<code>` may not nest with `<strong>`, `<em>`, `<a>`, `<strike>`, `<u>`, `<sub>`, or `<sup>` in either direction. ADF represents inline styling as marks on text nodes, and the `code` mark is mutually exclusive with the other inline marks. Applying styling to monospace code has no defensible rendering anyway: Code is meant to display literal characters.

**Workaround:** Move the `<code>` outside the styling wrapper so the two apply to different text runs, or drop the styling entirely.

```html
<!-- Wrong -->
<strong><code>isDevMode</code> parameter</strong>

<!-- Right (separate text runs) -->
<strong>The </strong><code>isDevMode</code><strong> parameter</strong>

<!-- Also right (drop the styling) -->
<code>isDevMode</code> parameter
```

#### Multi-line code samples

`<pre>` is omitted from the allowlist entirely, and the checker also flags multi-line `<pre>` separately. ADF's `codeBlock` node accepts plain text, but the converter mishandles the combination of newlines and quote characters inside the `pre` block. Inline `<code>` in `<p>` survives the same characters, so the `<pre>` wrapper is the differentiator.

**Workaround:** Render multi-line code as either multiple `<p><code>...</code></p>` paragraphs (one per logical line) or a single `<p>` with `<br>` separators between lines and inline `<code>` wrapping the code on each line. Single-line code is unchanged; continue to use inline `<code>` inside `<p>` or `<li>` as usual.

### Character handling

Use **literal Unicode** in HTML. Do not use named HTML entities outside the three universally-safe ones. The checker flags any named entity other than `&amp;`, `&lt;`, `&gt;` in text content.

| Don't write | Write instead            |
| ----------- | ------------------------ |
| `&mdash;`   | `—` (U+2014)             |
| `&ndash;`   | `–` (U+2013)             |
| `&hellip;`  | `…` (U+2026)             |
| `&nbsp;`    | regular space, or U+00A0 |
| `&copy;`    | `©` (U+00A9)             |
| `&rsquo;`   | `'` (U+2019)             |

`&quot;` and `&apos;` are valid only inside attribute values where they're needed to avoid clashing with the attribute's quote style. The checker only scans text content for named entities, so legitimate attribute-value uses are not flagged.

### Recovery protocol (backstop)

Use only if `INVALID_INPUT` still fires after the pre-flight checker returned `ok: true`. A clean checker result followed by an MCP rejection means the payload triggered an unknown failure class that the checker does not yet catch.

#### 1. Surface the failure to the user

Do not create a probe ticket silently. Present the situation to the user and let them choose how to proceed. Use the [option format](#option-format):

> Jira rejected this payload and the pre-flight checker found no known issues. This is likely a new failure class. How should I proceed?
>
> 1. ■■□ Probe and bisect:
>    - ➕ pinpoints the exact failing fragment for a fix or a future checker rule
>    - ➖ creates a real ticket tagged `mcp-probe` that needs eventual cleanup
> 2. ■□□ Show the payload for manual submission:
>    - ➕ no probe ticket created; you can edit and submit via the Jira UI
>    - ➖ no diagnostic captured for future hardening
> 3. ■□□ Skip ticket creation:
>    - ➕ no further side effects
>    - ➖ the failure class remains unidentified

#### 2. If the user picks option 1 (probe and bisect)

a. **Probe.** Create a ticket with `<p>ok</p>` as the entire payload. The create call must include the tagging contract below ([Probe-ticket tagging contract](#probe-ticket-tagging-contract)). If the probe also fails, the problem is call shape, permissions, or the issue itself (not the payload). Stop and report.
b. **Bisect.** If the probe succeeds, the failure is in the payload's content. Bisect the payload (split in half, test each half, recurse) to isolate the smallest fragment that still triggers `INVALID_INPUT`.
c. **Cap retries.** Do not exceed 4 retry attempts beyond the original failure. If the bisection has not converged by then, surface the smallest failing fragment to the user and stop.

#### 3. Record the failure

Regardless of which option the user picked, append a single JSON object (one line, no trailing comma) to `~/ai-artifacts/skill-failures/update-jira-ticket.jsonl`. Create the directory and file if absent.

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
- `failing_fragment`: The smallest payload fragment that reproduced `INVALID_INPUT`. When the user chose option 2 or 3, record the full rejected payload.
- `notes`: Free-form. Name the suspected trigger class if recognisable, otherwise leave empty.

#### Probe-ticket tagging contract

When (and only when) a probe ticket is created in step 2a, it **must** have all three markers:

- **Label:** Include `mcp-probe` in the `labels` argument of the create call.
- **Title:** `mcp-probe: {YYYY-MM-DD HH:MM} bisection probe`. Use UTC.
- **Description:** Prefix the description with `Auto-created by recovery protocol on {YYYY-MM-DD}; safe to delete.` followed by a blank line and then the probe payload.

A probe ticket that lacks any of these markers will not be picked up by the cleanup query below and risks polluting the user's backlog indefinitely.

### Probe-ticket cleanup

Probe tickets created via the recovery protocol are designed to be swept by a single JQL query:

```
project = <project> AND labels = mcp-probe AND created < -1d
```

Run this query periodically and bulk-transition any matches to a closed/deleted state. Probe tickets created before this skill version went live will not have the `mcp-probe` label and must be cleaned up by hand.

### Escalation criterion

If recorded failures concentrate in a **new trigger class** that the checker does not currently cover, file a follow-up to add a rule for it. The rule list in `rules.ts` is the canonical inventory of what the checker catches; extending it is the right unit of escalation.

If recorded failures distribute across truly **unknown classes** (no clear pattern), the recovery protocol remains the right tool. See [#467](https://github.com/williamthorsen/codeassembly/issues/467) for the prior decision context and [#468](https://github.com/williamthorsen/codeassembly/issues/468) for the generic-logging follow-up.

### Antipatterns

- Skipping the pre-flight check before invoking `update_jira_issue` / `create_jira_issue`.
- Creating a probe ticket without the `mcp-probe` label, the deterministic title, and the description prefix.
- Hand-authoring HTML containing constructs outside the allowlist.
- Passing `- [ ]` / `- [x]` brackets into `<li>` text instead of rendering a plain bullet.
- Combining `<code>` with other inline marks on the same text run.
- Using named HTML entities other than `&amp;`, `&lt;`, `&gt;` in text content.
- Passing a file path to `description_html` / `comment_html`.
- Retrying past the 4-retry cap.
- Skipping the failure record after a recovery: This removes the evidence needed to extend the checker.

<!-- include: ../_partials/option-format.md / -->
