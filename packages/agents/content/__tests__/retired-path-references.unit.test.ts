import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// `install` deployed `~/.agents/AGENTS.md` until the tier was retired. Nothing writes it now, so a skill or subagent
// naming it sends an agent to a file that is absent on an upgraded machine and stale on one that kept a hand-written
// copy. Per-user guidance reaches a body through a guidance hook, and the harness's own guidance file is named with
// `{harness_home_dir}/{harness_guidance_file}`.
//
// The pattern is tilde-anchored, so the repo-local `.agents/AGENTS.md` that `update-project-guidance` migrates from
// still passes.
const RETIRED_PATH = '~/.agents/AGENTS.md';

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

// Both trees an agent reads at runtime. Two of the retired path's consumers were skills, so a subagent-only guard
// would leave the reintroduction route open where it was actually used.
const SCANNED_DIRS: ReadonlyArray<string> = ['skills', 'subagents'];

interface Violation {
  readonly file: string;
  readonly line: number;
}

describe('retired path references', () => {
  it(`no skill or subagent references ${RETIRED_PATH}`, async () => {
    const violations = await findViolations();
    const message = `Deployed content names the retired ${RETIRED_PATH}:\n  ${violations
      .map((violation) => `${violation.file}:${violation.line}`)
      .join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // Every assertion above is negative, so a detector that stopped matching would leave the suite green and the guard
  // gone. This pins the detector against the string it exists to catch.
  it('detects the retired path in a scanned file', () => {
    expect(findLineNumbers(`See ${RETIRED_PATH} first.\n`)).toEqual([1]);
  });

  it('accepts the repo-local path the retirement did not withdraw', () => {
    expect(findLineNumbers('Migrate content out of .agents/AGENTS.md.\n')).toEqual([]);
  });
});

// region | Helpers

/** Reports each 1-based line of `content` that names the retired path. */
function findLineNumbers(content: string): ReadonlyArray<number> {
  return content
    .split('\n')
    .map((line, index) => (line.includes(RETIRED_PATH) ? index + 1 : 0))
    .filter((lineNumber) => lineNumber > 0);
}

/** Scans every deployed Markdown file for the retired path. */
async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  for (const dir of SCANNED_DIRS) {
    const root = path.join(CONTENT_ROOT, dir);
    for (const file of await listMarkdownFiles(root)) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      for (const line of findLineNumbers(await readFile(file, 'utf8'))) {
        violations.push({ file: relativePath, line });
      }
    }
  }
  return violations;
}

// endregion | Helpers
