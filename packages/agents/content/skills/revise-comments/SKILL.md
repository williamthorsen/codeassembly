---
name: revise-comments
description: Revise comments in target files per the comment-discipline rules, editing in place
user-invocable: true
---

# Revise comments

Apply the comment-discipline audit to a target file set, editing comments in place. The default workflow is `{skill:revise-comments}` after a feature is implemented; explicit paths support cleaning up legacy code.

## Invocation

- `{skill:revise-comments}` — default target is files committed on the current branch relative to the default branch. To audit uncommitted work, pass explicit paths (`{skill:revise-comments} .` covers the working tree).
- `{skill:revise-comments} <path> [<path>...]` — explicit file or directory targets. Directories are processed recursively.
- `{skill:revise-comments} --dry-run [...]` — produce the summary without applying edits. Triage and dry-run are unified under this flag.

## Process

1. **Resolve the target file set.**

   With no argument, the target is the set of files changed in commits on the current branch relative to the default branch. Obtain `$default_branch` via `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`, then:

   ```bash
   git diff --name-only "$default_branch...HEAD"
   ```

   With explicit arguments: For each argument, if it is a file, add it to the set; if it is a directory, list its contents via `git ls-files <dir>` and `git ls-files --others --exclude-standard <dir>`, then add the comment-supporting files from that listing. The `git ls-files` form respects `.gitignore`, so `node_modules/`, `dist/`, and other non-authored trees stay out of the set.

2. **Apply the audit per file.** Read each target file. Put every comment through the three tests below. Decide one of three actions: kept, deleted, or rewritten. In normal mode, apply edits in place via the Edit tool. In `--dry-run` mode, record the proposed action without editing.

3. **Audit the diff** per [Diff audit](#diff-audit), over the edits just applied. A re-worded comment is the reach sweep's central case: It can invalidate a sibling doc, a README, or a test title that echoed the phrasing it replaced. Such a file sits outside the resolved target set, so [Safety](#safety) governs and the hit is reported to the user alongside the summary rather than repaired. `--dry-run` applies no edits, so the step is skipped there.

4. **Emit the summary.** After processing all targets, emit one table per file with non-trivial decisions.

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- include: ../../_partials/diff-audit-checklist.md / -->

## File-level carve-outs

The carve-outs above apply to comments. Two file-level rules govern which lines this skill may touch at all:

- **Test files.** Path contains `__tests__/` or filename matches `*.spec.*` / `*.test.*`. The test-comment carve-out applies inside them; the three tests still govern everything else in the file.
- **`eslint-disable` lines.** Lines beginning with `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line`, or the block forms `/* eslint-disable */` and `/* eslint-enable */`. Keep the rationale, tightened to name only why the rule is suppressed at that line. Strip surrounding context, ticket references, and design discussion.

## When to pause and ask

The default is to act. Pause and ask the user when one of these holds:

- A test comment could plausibly be non-obvious setup, but the test name already conveys the setup intent.
- An `eslint-disable` rationale sits at the boundary between tight and over-scoped.
- A file header describes potentially load-bearing architecture (composition order, threading model, invariants across functions), so it may carry a constraint the code cannot show.

## Summary format

After processing, emit one Markdown table per file. Skip files with zero decisions. The same format appears in normal and `--dry-run` runs; in dry-run mode, append `(dry-run)` to the heading.

```
revise-comments summary

src/lib/payload.ts
| Line | Action    | Test         | Reason                           |
| ---- | --------- | ------------ | -------------------------------- |
| 1    | deleted   | one-location | duplicates the per-function docs |
| 2    | deleted   | stranger     | PR reference                     |
| 4    | rewritten | stranger     | "we discussed"                   |
| 6    | kept      | —            | why-inline                       |
```

Line numbers anchor to the pre-edit file, so each row is checked against `git diff` output before the table is emitted: The `Action` column reports what the diff shows, not what was intended. A comment failing more than one test names the first it fails.

## Safety

<HARD-GATE>
Never edit files outside the resolved target set. Resolve the set once at the start of the run and stay within it. Do not follow imports, expand to siblings, or touch files reachable from a touched file but outside the original set.
</HARD-GATE>

## Worked example

A small file demonstrating multi-comment revision end-to-end.

**Before** (`src/lib/payload.ts`):

```ts
// Helpers for building the request payload sent to the orchestrator API.
// Originally added in PR #423 to consolidate the type narrowing logic.

// Builds the canonical payload shape. We discussed inlining but it's used at three call sites.
export function buildPayload(input: Input): Payload {
  // react-select types value as a union; narrow to array.
  const items = Array.isArray(input.value) ? input.value : [input.value];
  return { items };
}
```

**After:**

```ts
/** Builds the canonical payload shape. */
export function buildPayload(input: Input): Payload {
  // react-select types value as a union; narrow to array.
  const items = Array.isArray(input.value) ? input.value : [input.value];
  return { items };
}
```

**Summary emitted:**

```
revise-comments summary

src/lib/payload.ts
| Line | Action    | Test         | Reason                           |
| ---- | --------- | ------------ | -------------------------------- |
| 1    | deleted   | one-location | duplicates the per-function docs |
| 2    | deleted   | stranger     | PR reference                     |
| 4    | rewritten | stranger     | "we discussed"                   |
| 6    | kept      | —            | why-inline                       |
```
