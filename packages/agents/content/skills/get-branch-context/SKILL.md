---
name: get-branch-context
description: Retrieve all branch metadata from a single cached manifest, reducing repeated metadata lookups from ~3 to 1
user-invocable: false
---

# Get branch context

Return all branch metadata as a single object by reading a cached manifest file. If the manifest does not exist, derive all metadata and persist it for future invocations.

**Zero-Bash contract:** This skill uses only Read and Write tools. It never invokes Bash commands or shell scripts.

## Manifest location

```
.agents/{sanitized-branch}.branch-manifest.json
```

The branch name is sanitized for filesystem safety: replace `/` with `-`. Do not replace `_` (it is a valid filename character).

Example: branch `MAC-130/agents/feat/branch-manifest` produces `.agents/MAC-130-agents-feat-branch-manifest.branch-manifest.json`.

**Backward compatibility:** When checking for an existing manifest, first look for `.branch-manifest.json` (new). If not found, also check `.manifest.json` (old). If the old format is found, read and return it as-is. Always write new manifests with the `.branch-manifest.json` extension.

## Manifest schema

```json
{
  "ticket_id": "MAC-130",
  "project_slug": "configs-macos",
  "default_branch": "origin/main",
  "branch_name": "MAC-130/agents/feat/branch-manifest",
  "created_at": "2026-02-25T19:43:00Z"
}
```

| Field            | Type               | Description                                                             |
| ---------------- | ------------------ | ----------------------------------------------------------------------- |
| `ticket_id`      | `string` or `null` | Ticket ID extracted from branch name, or `null` if not derivable        |
| `project_slug`   | `string`           | Project slug for artifact namespacing (from `.agents/preferences.yaml`) |
| `default_branch` | `string`           | Full remote reference for the default branch (from preferences)         |
| `branch_name`    | `string`           | Raw branch name as it appears in `gitStatus`                            |
| `created_at`     | `string`           | ISO 8601 UTC timestamp of when the manifest was created                 |

## Resolution order

### 1. Manifest lookup (fast path)

Check for an existing manifest file before performing any derivation.

1. Read the current branch name from the `gitStatus` field in the system prompt. Match the line `Current branch: {name}` and take the text after the colon and space, trimmed of leading and trailing whitespace.
2. If `gitStatus` is absent or does not contain a `Current branch:` line, return an error: "Cannot determine branch name: gitStatus not available in system prompt."
3. If the branch name is empty or the gitStatus indicates a detached HEAD state, return an error: "Detached HEAD: this skill requires an active branch. Create or check out a branch before invoking this skill."
4. Sanitize the branch name: trim any leading or trailing whitespace, then replace every `/` with `-`. After replacing, remove any trailing `-` characters.
5. Use the Read tool to attempt reading `.agents/{sanitized-branch}.branch-manifest.json`.
6. If the file exists and contains valid JSON, return the manifest object. Done.
7. If the file does not exist, use the Read tool to attempt reading `.agents/{sanitized-branch}.manifest.json` (old format).
8. If the old-format file exists and contains valid JSON, return the manifest object. Done. Do not create a new `.branch-manifest.json` file in this case. Old `.manifest.json` files are supported for reading but not automatically migrated. To migrate, delete the old file and re-invoke the skill.
9. If either file exists but contains invalid JSON (corrupt manifest), note the path for overwrite and fall through to step 2 (derivation). A corrupt old-format file is overwritten in place at its old path (`.manifest.json`), not migrated to the new path.
10. If neither file exists, fall through to step 2 (derivation).

### 2. Derivation

If no valid manifest exists, derive each field from the branch name and preferences.

#### Branch name

Use the raw branch name extracted from `gitStatus` in step 1.

#### Ticket ID

Extract the ticket ID from the **start** of the branch name using these rules:

1. Look at the beginning of the branch name for a pattern matching: **two or more letters** (minimum 2), then a hyphen, then one or more digits, optionally followed by **a single** dot and one or more digits (e.g., `NMR-567.2`). Do not match multiple decimal components like `NMR-567.2.3`. **Single-letter prefixes are not valid ticket IDs**: `a-1`, `x-99`, `b-123-test` must not match. Valid prefixes have at least two letters: `PT-1`, `MAC-147`, `ab-5`.
2. The match must be anchored to the start of the branch name. Do not match ticket-ID-like patterns in the middle of the branch name (e.g., `foo-bar-123` must **not** match `bar-123`).
3. The match is **case-insensitive**: both `MAC-147` and `mac-147` are valid matches.
4. **Normalize to uppercase**: the ticket ID is always stored in uppercase (e.g., `mac-147` becomes `MAC-147`).
5. The ticket ID pattern ends at the first `/` or `_` separator, or at the end of the branch name if it is the entire branch name. Do not continue matching past the first separator or into hyphenated descriptions. For example, `MAC-147-some-description` extracts `MAC-147` (the match stops before the second hyphen because `-s` does not continue the digits pattern), and `MAC-147/feat/foo` extracts `MAC-147`.
6. If no prefixed ticket ID is found, check for a **bare issue number**: one or more digits anchored to the start of the branch name, terminated by `/`, `_`, or `-`, or at the end of the branch name if it is the entire name. Examples: `147/feat/something` → `147`, `42_fix_login` → `42`, `99` → `99`. Do not match digits that appear after non-digit characters.
7. If a bare issue number is found, read `project.ticket_prefix` from `.agents/preferences.yaml`:
   - If `ticket_prefix` is `#` (a GitHub display prefix): return the **bare number only**. The `#` character is a display convention, not an identifier component, and must not appear in file paths.
   - If a Jira-style prefix is configured (e.g., `MAC-`): ticket ID = `{ticket_prefix}{number}` (e.g., prefix `MAC-` + number `147` → `MAC-147`).
   - If no prefix is configured: ticket ID = the number alone (e.g., `147`).
8. If neither a prefixed ticket ID nor a bare issue number is found, the ticket ID is `null`.

#### Description

Everything after the ticket ID and its trailing separator is the description. If the branch name consists of only the ticket ID (no separator or content after it), the description is the empty string.

#### Project slug

Read `.agents/preferences.yaml` using the Read tool. Extract the `project.slug` value from the YAML content. Read the file line by line: when you encounter a line `project:` (at the top level, with no leading whitespace), subsequent indented lines belong to that section until the next non-indented line. Match `slug:` within that section and take the value after the colon, trimmed of leading/trailing whitespace and quotes.

If `project.slug` is not found, fall back to `repository.slug` (deprecated field, found under the `repository:` section). If neither is found, default to `unknown`.

Also extract `project.ticket_prefix` from the same `project:` section (e.g., `MAC-`). This value is used by the ticket ID extraction logic (step 7) when a bare issue number is found. If not present, no prefix is applied.

#### Default branch

From the same `.agents/preferences.yaml` content, extract `repository.default_remote[0].name` and `repository.default_remote[0].default_branch`. Find the `repository:` section (top-level, no leading whitespace), then `default_remote:` (indented under it). The first list item starts with `- name:` (YAML list items begin with `-`). Extract the `name` value and the `default_branch` value from that list item, trimming whitespace and quotes.

Construct the full remote reference as `{name}/{default_branch}` (e.g., `origin/main`).

If preferences are missing or the fields are absent, default to `origin/main`.

### 3. Persist manifest

After deriving all fields, persist the manifest using the Write tool.

1. If a corrupt manifest was detected in step 1.9, the Write tool will overwrite it at the path noted in that step (old-format corrupt files are overwritten in place, new-format corrupt files are overwritten at the new path).
2. Construct the JSON object with all 5 fields.
3. For the `created_at` field, take the `currentDate` value (format `YYYY-MM-DD`) from the system prompt and append `T00:00:00Z` to create the timestamp. Since exact time is not available without Bash, use midnight UTC as the time component. Same-day manifests will have identical `created_at` values.
4. If no corrupt file is being overwritten, use the Write tool to save to `.agents/{sanitized-branch}.branch-manifest.json`.

**Null serialization:** The `ticket_id` field may be JSON `null`. Serialize as the unquoted keyword `null`, not the string `"null"` or an empty string `""`.

**Immutability contract:** Once created, a manifest file is never overwritten. It captures the branch context at creation time. The one exception is a **corrupt manifest** (invalid JSON): a corrupt file is deleted and the derivation process runs again to produce a new file.

## Usage

### Typical agent workflow

Before this skill, agents made up to 3 separate metadata calls:

```
get-ticket-id         -> MAC-130
get-project-slug      -> configs-macos
get-default-branch    -> origin/main
```

With this skill, a single call returns all metadata:

```
get-branch-context    -> { ticket_id, project_slug, default_branch, branch_name, created_at }
```

On the first invocation, the skill derives and caches. On subsequent invocations, it reads from the manifest file (single file read, zero permission prompts).

### Worked examples

#### 1. Structured branch (old format with workspace and work type segments)

Branch: `MAC-130/agents/feat/branch-manifest`

**Derivation trace:**

1. Ticket ID: branch starts with `MAC-130` (letters-hyphen-digits). Extract `MAC-130`.
2. Everything after `MAC-130/` is the description: `agents/feat/branch-manifest`.

```json
{
  "ticket_id": "MAC-130",
  "project_slug": "configs-macos",
  "default_branch": "origin/main",
  "branch_name": "MAC-130/agents/feat/branch-manifest",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 2. Simple branch with description

Branch: `PT-456/fix/login-redirect`

**Derivation trace:**

1. Ticket ID: `PT-456`.
2. Everything after `PT-456/` is the description: `fix/login-redirect`.

```json
{
  "ticket_id": "PT-456",
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "PT-456/fix/login-redirect",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 3. Lowercase ticket ID (case normalization)

Branch: `mac-147`

**Derivation trace:**

1. Ticket ID: branch starts with `mac-147` (letters-hyphen-digits, case-insensitive). Extract and normalize to uppercase: `MAC-147`.
2. After stripping the ticket ID, nothing remains. Description is empty.

```json
{
  "ticket_id": "MAC-147",
  "project_slug": "configs-macos",
  "default_branch": "origin/main",
  "branch_name": "mac-147",
  "created_at": "2026-02-27T00:00:00Z"
}
```

#### 4. Non-ticket branch (no issue number)

Branch: `experiment/try-new-parser`

**Derivation trace:**

1. Ticket ID: `experiment` is followed by `/`, not `-[digit]`. No prefixed ticket ID match.
2. Bare issue number check: first character `e` is not a digit. No bare number found.
3. Ticket ID is `null`. The full branch name is treated as the description (not stored separately in the manifest).

```json
{
  "ticket_id": null,
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "experiment/try-new-parser",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 5. Underscore-separated branch

Branch: `MAC-130_agents_feat_branch-manifest`

**Derivation trace:**

1. Ticket ID: `MAC-130`.
2. Everything after `MAC-130_` is the description: `agents_feat_branch-manifest`.

Produces the same ticket ID as the slash-separated variant. Separators `_` and `/` are interchangeable.

```json
{
  "ticket_id": "MAC-130",
  "project_slug": "configs-macos",
  "default_branch": "origin/main",
  "branch_name": "MAC-130_agents_feat_branch-manifest",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 6. Decimal version ticket ID

Branch: `NMR-567.2/fix/regression`

**Derivation trace:**

1. Ticket ID: `NMR-567.2` (the optional `.2` decimal suffix is captured).
2. Everything after `NMR-567.2/` is the description: `fix/regression`.

```json
{
  "ticket_id": "NMR-567.2",
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "NMR-567.2/fix/regression",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 7. Ticket-ID-only branch

Branch: `MAC-200`

**Derivation trace:**

1. Ticket ID: `MAC-200`.
2. After stripping the ticket ID, nothing remains. Description is empty.

```json
{
  "ticket_id": "MAC-200",
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "MAC-200",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 8. Single-letter prefix (not a valid ticket ID)

Branch: `a-1-test`

**Derivation trace:**

1. Ticket ID: `a` is only one letter. The ticket ID pattern requires **two or more letters** before the hyphen. `a-1` is not a valid ticket ID. No match.
2. Bare issue number check: first character `a` is not a digit. No bare number found.
3. Ticket ID is `null`. The full branch name is treated as the description (not stored separately in the manifest).

```json
{
  "ticket_id": null,
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "a-1-test",
  "created_at": "2026-02-25T00:00:00Z"
}
```

#### 9. Bare issue number with configured prefix

Branch: `147/feat/improve-parser`
Preferences: `project.ticket_prefix: MAC-`

**Derivation trace:**

1. Ticket ID: No `[A-Z]{2,}-[0-9]+` match at start (begins with digits). No prefixed ticket ID.
2. Bare issue number check: `147` found at start, terminated by `/`.
3. Read `project.ticket_prefix` from preferences: `MAC-`.
4. Construct ticket ID: `MAC-` + `147` = `MAC-147`.
5. Everything after `147/` is the description: `feat/improve-parser`.

```json
{
  "ticket_id": "MAC-147",
  "project_slug": "configs-macos",
  "default_branch": "origin/main",
  "branch_name": "147/feat/improve-parser",
  "created_at": "2026-02-28T00:00:00Z"
}
```

#### 10. Bare issue number without configured prefix

Branch: `42_fix_login-redirect`
Preferences: no `project.ticket_prefix` configured

**Derivation trace:**

1. Ticket ID: No `[A-Z]{2,}-[0-9]+` match at start. No prefixed ticket ID.
2. Bare issue number check: `42` found at start, terminated by `_`.
3. No `project.ticket_prefix` in preferences.
4. Ticket ID is `42` (number alone).
5. Everything after `42_` is the description: `fix_login-redirect`.

```json
{
  "ticket_id": "42",
  "project_slug": "example-project",
  "default_branch": "origin/main",
  "branch_name": "42_fix_login-redirect",
  "created_at": "2026-02-28T00:00:00Z"
}
```

#### 11. Bare issue number with `#` display prefix

Branch: `152`
Preferences: `project.ticket_prefix: '#'`

**Derivation trace:**

1. Ticket ID: No `[A-Z]{2,}-[0-9]+` match at start (begins with digits). No prefixed ticket ID.
2. Bare issue number check: `152` found at start, at end of branch name.
3. Read `project.ticket_prefix` from preferences: `#`.
4. Prefix is `#` (display-only convention). Return bare number: `152`.
5. After stripping the ticket ID, nothing remains. Description is empty.

```json
{
  "ticket_id": "152",
  "project_slug": "codeassembly",
  "default_branch": "origin/main",
  "branch_name": "152",
  "created_at": "2026-03-03T00:00:00Z"
}
```

## Edge cases

- **Corrupt manifest**: If a manifest file exists but contains invalid JSON, delete it and fall through to derivation to produce a new file.
- **Detached HEAD**: If `gitStatus` does not indicate an active branch (no `Current branch:` line or empty value), return an error message. Do not attempt derivation.
- **Missing preferences**: If `.agents/preferences.yaml` cannot be read, default `project_slug` to `unknown` and `default_branch` to `origin/main`.
- **Author-prefixed branches**: Branch names like `wthorsen/MAC-130` are not matched for ticket ID extraction (the ticket ID must be at the start). The ticket ID will be `null`. (The ticket ID is visually present but not at position zero; extracting it would require a separate enhancement.)

## Constraints

- **Never use Bash** — all operations use Read and Write tools only
- Always return the full manifest object, never a subset
- Do not prompt the user — this is a non-interactive utility skill
- Manifest files are immutable once created — never overwrite (the sole exception: corrupt manifests with invalid JSON are deleted and re-derived)
- Branch name sanitization only replaces `/` with `-` (do not replace `_`)
- If on a detached HEAD, return an error — do not attempt derivation without a branch name
- Branch names must start with the ticket ID or a bare issue number (per branch naming format). Author-prefixed branches (e.g., `wthorsen/MAC-130`) are not matched — the ticket ID will be `null` (same limitation as before; extraction from non-start positions is not supported).
- Manifest files are local-only (gitignored) and are not committed to the repository. The `.agents/` directory itself is committed for project-scoped config like `preferences.yaml`.
