import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDetect } from '../cli.ts';
import type { DetectResult, DetectSuccess } from '../types.ts';

/**
 * One reduced object relative in a Markdown file. The site is the rulebook's own pronoun-shape exhibit, so the fields
 * a legacy consumer reads are all populated rather than left at a default.
 */
const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': 'The helper reports the source it names.\n',
};

/** Every field the helper's candidates carried before rules were introduced. */
const LEGACY_CANDIDATE_FIELDS: ReadonlyArray<string> = [
  'file',
  'head',
  'line',
  'phrase',
  'sentence',
  'shape',
  'subject',
  'verb',
];

/** Every field the helper's summary carried before rules were introduced. */
const LEGACY_SUMMARY_FIELDS: ReadonlyArray<string> = ['byFile', 'byShape', 'filesScanned', 'filesSkipped', 'total'];

describe(runDetect, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'revise-object-relatives-cli-'));
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    for (const [file, content] of Object.entries(FIXTURE_FILES)) {
      await mkdir(path.join(scratch, path.dirname(file)), { recursive: true });
      await writeFile(path.join(scratch, file), content, 'utf8');
    }
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('carries every field the legacy invocation reported, and adds the rule', async () => {
    const result = expectSuccess(await sweep());
    const candidate = result.candidates[0];

    expect(candidate).toBeDefined();
    for (const field of LEGACY_CANDIDATE_FIELDS) {
      expect(candidate, `candidate lost the legacy field "${field}"`).toHaveProperty(field);
    }
    expect(candidate).toMatchObject({
      rule: 'reduced-object-relative',
      file: 'docs/guide.md',
      head: 'source',
      shape: 'pronoun',
      subject: 'it',
      verb: 'names',
    });
  });

  it('carries every summary field the legacy invocation reported, and adds the per-rule counts', async () => {
    const { summary } = expectSuccess(await sweep());

    for (const field of LEGACY_SUMMARY_FIELDS) {
      expect(summary, `summary lost the legacy field "${field}"`).toHaveProperty(field);
    }
    expect(summary.byRule).toStrictEqual({ 'em-dash': 0, 'reduced-object-relative': 1 });
    expect(summary.byShape).toStrictEqual({ quantified: 0, definite: 0, bare: 0, pronoun: 1 });
  });

  it('reports a root outside a git working tree as a structured failure', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'revise-object-relatives-bare-'));
    try {
      expect(await runDetect({ argv: [], root: outside, home: outside })).toMatchObject({
        ok: false,
        error: 'not-a-repository',
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  // region | Helpers

  /** Sweeps the fixture repository, anchoring `home` at the scratch tree so no real preferences reach the run. */
  async function sweep(argv: readonly string[] = []): Promise<DetectResult> {
    return runDetect({ argv, root: scratch, home: scratch });
  }

  // endregion | Helpers
});

// region | Helpers

/** Narrows a result to its success arm, failing the test with the helper's own message when it is not one. */
function expectSuccess(result: DetectResult): DetectSuccess {
  if (!result.ok) {
    throw new Error(`expected a successful sweep, got ${result.error}: ${result.message}`);
  }
  return result;
}

// endregion | Helpers
