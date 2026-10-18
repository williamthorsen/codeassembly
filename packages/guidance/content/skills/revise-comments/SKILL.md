---
name: revise-comments
description: Revise comments in target files per the comment-discipline rules, adding missing code descriptions and fixing drifted ones, editing in place
user-invocable: true
---

# Revise comments

Apply the comment-discipline audit to a target file set, editing comments in place: Keep, delete, or rewrite each comment, add a description to each declaration that lacks one, and rewrite each description that misstates its code. The default workflow is `{skill:revise-comments}` after a feature is implemented; explicit paths support cleaning up legacy code.

If the `revise-prose` sweep is wanted on the same files, run this skill first: It decides whether a comment exists at all, and it may delete the very comment that the prose sweep would otherwise polish.

## Invocation

- `{skill:revise-comments}`: Default target is files committed on the current branch relative to the default branch. To audit uncommitted work, pass explicit paths (`{skill:revise-comments} .` covers the working tree).
- `{skill:revise-comments} <path> [<path>...]`: Explicit file or directory targets. Directories are processed recursively.
- `{skill:revise-comments} --dry-run [...]`: Produce the summary without applying edits. Triage and dry-run are unified under this flag.

## Process

1. **Resolve the target file set** per [Target file set](#target-file-set), keeping the comment-supporting files from what it yields.

   Without an argument, the target is the set of files changed in commits on the current branch relative to the default branch. Obtain `{default_branch}` via `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`, then:

   ```bash
   git diff --name-only "{default_branch}...HEAD"
   ```

2. **Apply the audit per file.** Read each target file. Put every comment through the tests below, and every declaration through [Description coverage and accuracy](#description-coverage-and-accuracy). Decide one of four actions: kept, deleted, rewritten, or added. In normal mode, apply edits in place via the Edit tool. In `--dry-run` mode, record the proposed action without editing.

3. **Audit the diff** per [Diff audit](#diff-audit), over the edits just applied. A re-worded comment is the reach sweep's central case: It can invalidate a sibling doc, a README, or a test title that echoed the phrasing that it replaced. Such a file is outside the resolved target set, so the hard gate in [Target file set](#target-file-set) applies: Report the hit to the user alongside the summary rather than repair it. Because `--dry-run` does not apply any edits, the step is skipped under that flag.

4. **Emit the summary.** After processing all targets, emit one table per file with non-trivial decisions.

<!-- include: ../../_partials/target-file-set-resolution.md / -->

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- include: ../../_partials/diff-audit-checklist.md / -->

## Description coverage and accuracy

Because the baseline above requires a description, this skill acts on declarations as well as on the comments that they have:

- **Coverage.** Add a description (`added`) to each function, method, class, and component that lacks one, helpers in test files included. Skip an anonymous callback passed inline, which is not a declaration. Do not add one to a constant or a type, for which the baseline makes a description optional.
- **Accuracy.** Compare each description with the code that it describes, and rewrite one that misstates what the code does or is. Length alone is not a reason to rewrite an accurate description.
- **Never deleted.** Rewrite a declaration's description that fails one of the four tests; never delete it, because the baseline requires one.
- **Form.** Write an added or rewritten description in the doc-comment form that the file already uses, or else in the language's standard form, such as JSDoc in TypeScript.

## File-level carve-outs

The carve-outs above apply to comments. Two file-level rules decide which lines this skill may touch at all:

- **Test files.** Path contains `__tests__/` or filename matches `*.spec.*` / `*.test.*`. The test-comment carve-out applies inside them; the tests still apply to everything else in the file.
- **`eslint-disable` lines.** Lines beginning with `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line`, or the block forms `/* eslint-disable */` and `/* eslint-enable */`. Keep the rationale, tightened to name only why the rule is suppressed at that line. Strip surrounding context, ticket references, and design discussion.

## When to pause and ask

The default is to act. Pause and ask the user when one of these holds:

- A test comment could plausibly be non-obvious setup, but the test name already conveys the setup intent.
- An `eslint-disable` rationale is at the boundary between tight and over-scoped.
- A file header describes potentially load-bearing architecture (composition order, threading model, invariants across functions), so it may state a constraint that the code cannot show.
- A description and its code disagree, and the code could be the part that is wrong, such as when the declaration's name agrees with the description. Rewriting the description would record the defect as intended behavior, and this skill never edits code.

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
| 6    | kept      | n/a          | why-inline                       |
```

`Test` names the test that decided the action: one of the four, `accuracy`, `baseline` for an added description, or `n/a`. For `added`, `Line` is the declaration's line.

Line numbers refer to the pre-edit file, so check each row against `git diff` output before emitting the table: The `Action` column reports what the diff shows, not what was intended. For a comment failing more than one test, report the first that it fails.

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

/** Returns the first item, or undefined when the payload is empty. */
export function lastItem(payload: Payload): Item | undefined {
  return payload.items.at(-1);
}

export function isEmptyPayload(payload: Payload): boolean {
  return payload.items.length === 0;
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

/** Returns the last item, or undefined when the payload is empty. */
export function lastItem(payload: Payload): Item | undefined {
  return payload.items.at(-1);
}

/** Reports whether the payload has no items. */
export function isEmptyPayload(payload: Payload): boolean {
  return payload.items.length === 0;
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
| 6    | kept      | n/a          | why-inline                       |
| 11   | rewritten | accuracy     | says first; code returns last    |
| 16   | added     | baseline     | no description                   |
```
