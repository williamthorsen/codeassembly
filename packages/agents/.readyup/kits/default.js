/** @noformat — @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.24.0";


// .readyup/kits/default.ts
import { dirname, join, relative } from "node:path";
import { defineRdyKit } from "readyup";
import { fileExists, readFile } from "readyup/check-utils";

// .readyup/lib/guidance-import.ts
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
var CODE_SPAN_PATTERN = /(`+)[^\n]*?\1/g;
var FENCE_CLOSER_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
var FENCE_OPENER_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
var IMPORT_PATTERN = /(?<=^|\s)@\S+/g;
function resolveGuidanceImports(documentText, importingDirPath, guidancePath) {
  const resolvedPaths = maskCodeSpans(maskFencedBlocks(documentText)).matchAll(IMPORT_PATTERN).map((match) => resolveImportPath(match[0].slice(1), importingDirPath)).toArray();
  return {
    doesReachGuidance: resolvedPaths.includes(resolve(guidancePath)),
    resolvedPaths
  };
}
function maskCodeSpans(documentText) {
  return documentText.replaceAll(CODE_SPAN_PATTERN, (span) => " ".repeat(span.length));
}
function maskFencedBlocks(documentText) {
  const lines = documentText.split("\n");
  let openDelimiter;
  for (const [index, line] of lines.entries()) {
    if (openDelimiter === void 0) {
      const opener = FENCE_OPENER_PATTERN.exec(line)?.[1];
      if (opener !== void 0) {
        openDelimiter = opener;
        lines[index] = "";
      }
      continue;
    }
    const closer = FENCE_CLOSER_PATTERN.exec(line)?.[1];
    if (closer?.startsWith(openDelimiter) === true) {
      openDelimiter = void 0;
    }
    lines[index] = "";
  }
  return lines.join("\n");
}
function resolveImportPath(importPath, importingDirPath) {
  if (importPath === "~" || importPath.startsWith("~/")) {
    return resolve(homedir(), importPath.slice(2));
  }
  if (isAbsolute(importPath)) {
    return resolve(importPath);
  }
  return resolve(importingDirPath, importPath);
}

// .readyup/lib/guidance-staleness.ts
import { runGit } from "readyup/check-utils";
var COMMIT_MARKER = "COMMIT";
var INCIDENTAL_FILE_PATTERN = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
async function readGuidanceStaleness(repoPath, guidancePath) {
  let stamp;
  try {
    stamp = await runGit(repoPath, "log", "-1", "--format=%H %ct", "--", guidancePath);
  } catch {
    return void 0;
  }
  const separatorIndex = stamp.indexOf(" ");
  if (separatorIndex === -1) {
    return void 0;
  }
  const commitSha = stamp.slice(0, separatorIndex);
  const lastModifiedEpochSec = Number(stamp.slice(separatorIndex + 1));
  if (!Number.isFinite(lastModifiedEpochSec)) {
    return void 0;
  }
  const log = await runGit(repoPath, "log", `--pretty=format:${COMMIT_MARKER}`, "--name-only", `${commitSha}..HEAD`);
  return { lastModifiedEpochSec, meaningfulCommitCount: countMeaningfulCommits(log) };
}
function countMeaningfulCommits(log) {
  let count = 0;
  let hasMeaningfulFile = false;
  for (const line of log.split("\n")) {
    if (line === COMMIT_MARKER) {
      if (hasMeaningfulFile) {
        count += 1;
      }
      hasMeaningfulFile = false;
      continue;
    }
    if (line !== "" && !INCIDENTAL_FILE_PATTERN.test(line)) {
      hasMeaningfulFile = true;
    }
  }
  return hasMeaningfulFile ? count + 1 : count;
}
function formatUtcDate(epochSec) {
  return new Date(epochSec * 1e3).toISOString().slice(0, 10);
}

// .readyup/kits/default.ts
var GUIDANCE_PATH = "AGENTS.md";
var CLAUDE_MEMORY_PATH = ".claude/CLAUDE.md";
var STALE_COMMIT_THRESHOLD = 20;
var REFRESH_FIX = `Run \`/update-project-guidance\` to refresh ${GUIDANCE_PATH}`;
var default_default = defineRdyKit({
  description: "Project-guidance wiring and freshness",
  checklists: [
    {
      name: "guidance",
      checks: [
        {
          name: `${GUIDANCE_PATH} is non-empty`,
          check: () => {
            const content = readFile(GUIDANCE_PATH);
            return content !== void 0 && content.trim().length > 0;
          },
          fix: `Run \`/update-project-guidance\` to author ${GUIDANCE_PATH} with the context agents need`
        },
        {
          name: `${CLAUDE_MEMORY_PATH} imports ${GUIDANCE_PATH}`,
          check: () => {
            const content = readFile(CLAUDE_MEMORY_PATH);
            if (content === void 0) {
              return { ok: false, detail: `${CLAUDE_MEMORY_PATH} is absent` };
            }
            const outcome = resolveGuidanceImports(
              content,
              join(process.cwd(), dirname(CLAUDE_MEMORY_PATH)),
              join(process.cwd(), GUIDANCE_PATH)
            );
            if (outcome.doesReachGuidance) {
              return true;
            }
            return { ok: false, detail: describeImportTargets(outcome.resolvedPaths) };
          },
          fix: `Put \`@${relative(dirname(CLAUDE_MEMORY_PATH), GUIDANCE_PATH)}\` on a line of its own in ${CLAUDE_MEMORY_PATH}; Claude Code resolves the path against that file's own directory, not the repository root`
        },
        {
          name: `${GUIDANCE_PATH} is current`,
          severity: "recommend",
          skip: () => fileExists(GUIDANCE_PATH) ? false : `${GUIDANCE_PATH} is absent`,
          check: async () => {
            const staleness = await readGuidanceStaleness(process.cwd(), GUIDANCE_PATH);
            if (staleness === void 0) {
              return { ok: true, detail: "no commit history to measure against" };
            }
            const { lastModifiedEpochSec, meaningfulCommitCount } = staleness;
            return {
              ok: meaningfulCommitCount < STALE_COMMIT_THRESHOLD,
              detail: `last updated ${formatUtcDate(lastModifiedEpochSec)}, ${describeCommitCount(meaningfulCommitCount)} since`
            };
          },
          fix: REFRESH_FIX
        }
      ]
    }
  ]
});
function describeCommitCount(count) {
  return count === 1 ? "1 commit" : `${count} commits`;
}
function describeImportTargets(resolvedPaths) {
  if (resolvedPaths.length === 0) {
    return "no `@` import found";
  }
  return `imports resolve to ${resolvedPaths.map((path) => relative(process.cwd(), path)).join(", ")}`;
}
export {
  default_default as default
};
