import { dirname, join, relative } from 'node:path';

import { defineRdyKit } from 'readyup';
import { fileExists, readFile } from 'readyup/check-utils';

import { describeViolations, findHarnessScopedPaths, findRulebookMarkers } from '../lib/guidance-constraints.ts';
import { resolveGuidanceImports } from '../lib/guidance-import.ts';
import { countGuidanceLines } from '../lib/guidance-size.ts';
import { formatUtcDate, readGuidanceStaleness } from '../lib/guidance-staleness.ts';

const GUIDANCE_PATH = 'AGENTS.md';
const CLAUDE_MEMORY_PATH = '.claude/CLAUDE.md';
const STALE_COMMIT_THRESHOLD = 20;
/** Lines the guidance file may carry before it costs more launch context than it earns. */
const AMBIENT_LINE_BUDGET = 200;

const REFRESH_FIX = `Run \`/update-project-guidance\` to refresh ${GUIDANCE_PATH}`;

/**
 * Guidance checks the `codeassembly` package publishes to every repository that consumes it.
 *
 * They cover the convention the package's own tooling authors: project guidance at the repository-root
 * `AGENTS.md`, which Rovo Dev loads unaided and Claude Code reaches through one import.
 */
export default defineRdyKit({
  description: 'Project-guidance wiring, freshness, and size',
  checklists: [
    {
      name: 'guidance',
      checks: [
        {
          name: `${GUIDANCE_PATH} is non-empty`,
          check: () => {
            const content = readFile(GUIDANCE_PATH);
            return content !== undefined && content.trim().length > 0;
          },
          fix: `Run \`/update-project-guidance\` to author ${GUIDANCE_PATH} with the context agents need`,
        },
        {
          name: `${CLAUDE_MEMORY_PATH} imports ${GUIDANCE_PATH}`,
          check: () => {
            const content = readFile(CLAUDE_MEMORY_PATH);
            if (content === undefined) {
              return { ok: false, detail: `${CLAUDE_MEMORY_PATH} is absent` };
            }
            const outcome = resolveGuidanceImports(
              content,
              join(process.cwd(), dirname(CLAUDE_MEMORY_PATH)),
              join(process.cwd(), GUIDANCE_PATH),
            );
            if (outcome.doesReachGuidance) {
              return true;
            }
            return { ok: false, detail: describeImportTargets(outcome.resolvedPaths) };
          },
          fix: `Put \`@${relative(dirname(CLAUDE_MEMORY_PATH), GUIDANCE_PATH)}\` on a line of its own in ${CLAUDE_MEMORY_PATH}; Claude Code resolves the path against that file's own directory, not the repository root`,
        },
        {
          name: `${GUIDANCE_PATH} is current`,
          severity: 'recommend',
          skip: () => (fileExists(GUIDANCE_PATH) ? false : `${GUIDANCE_PATH} is absent`),
          check: async () => {
            const staleness = await readGuidanceStaleness(process.cwd(), GUIDANCE_PATH);
            if (staleness === undefined) {
              return { ok: true, detail: 'no commit history to measure against' };
            }
            const { lastModifiedEpochSec, meaningfulCommitCount } = staleness;
            return {
              ok: meaningfulCommitCount < STALE_COMMIT_THRESHOLD,
              detail: `last updated ${formatUtcDate(lastModifiedEpochSec)}, ${describeCommitCount(meaningfulCommitCount)} since`,
            };
          },
          fix: REFRESH_FIX,
        },
        {
          name: `${GUIDANCE_PATH} is harness-neutral`,
          severity: 'recommend',
          skip: () => (fileExists(GUIDANCE_PATH) ? false : `${GUIDANCE_PATH} is absent`),
          check: () => {
            const content = readFile(GUIDANCE_PATH);
            if (content === undefined) {
              return { ok: false, detail: `${GUIDANCE_PATH} is unreadable` };
            }
            const violations = findHarnessScopedPaths(content);
            if (violations.length === 0) {
              return true;
            }
            return { ok: false, detail: describeViolations(violations) };
          },
          fix: `Rewrite the offending paths as repository-relative; one body of text serves every harness, so a path under one harness's home is wrong for the rest`,
        },
        {
          name: `${GUIDANCE_PATH} hosts no rulebook region`,
          severity: 'recommend',
          skip: () => (fileExists(GUIDANCE_PATH) ? false : `${GUIDANCE_PATH} is absent`),
          check: () => {
            const content = readFile(GUIDANCE_PATH);
            if (content === undefined) {
              return { ok: false, detail: `${GUIDANCE_PATH} is unreadable` };
            }
            const violations = findRulebookMarkers(content);
            if (violations.length === 0) {
              return true;
            }
            return { ok: false, detail: describeViolations(violations) };
          },
          fix: `Delete the marked region and its markers; \`sync\` strips a complete pair from ${GUIDANCE_PATH} on its next run, and an unpaired marker escapes that sweep and lingers`,
        },
        {
          name: `${GUIDANCE_PATH} is within the ambient budget`,
          severity: 'recommend',
          skip: () => (fileExists(GUIDANCE_PATH) ? false : `${GUIDANCE_PATH} is absent`),
          check: () => {
            const content = readFile(GUIDANCE_PATH);
            if (content === undefined) {
              return { ok: false, detail: `${GUIDANCE_PATH} is unreadable` };
            }
            const lineCount = countGuidanceLines(content);
            return {
              ok: lineCount <= AMBIENT_LINE_BUDGET,
              detail: `${describeLineCount(lineCount)}, budget ${AMBIENT_LINE_BUDGET}`,
            };
          },
          fix: REFRESH_FIX,
        },
      ],
    },
  ],
});

// region | Helpers

/** Renders a commit count with the matching noun. */
function describeCommitCount(count: number): string {
  return count === 1 ? '1 commit' : `${count} commits`;
}

/** Names where a document's imports land, so a failure shows the resolved target rather than the literal. */
function describeImportTargets(resolvedPaths: ReadonlyArray<string>): string {
  if (resolvedPaths.length === 0) {
    return 'no `@` import found';
  }
  return `imports resolve to ${resolvedPaths.map((path) => relative(process.cwd(), path)).join(', ')}`;
}

/** Renders a line count with the matching noun. */
function describeLineCount(count: number): string {
  return count === 1 ? '1 line' : `${count} lines`;
}

// endregion | Helpers
