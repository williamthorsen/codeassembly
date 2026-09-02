import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DetectSuccess } from '../types.ts';

/**
 * The deployed bundle, executed as a process.
 *
 * Every other suite imports the modules and calls them directly, which completes module evaluation before the call.
 * Only a real invocation runs the top-level entry-point guard, so only this suite can catch a module-level declaration
 * ordered after it, or a bundling failure that leaves the entry point unable to run at all.
 */
const BUNDLE = new URL('../../../content/skills/revise-object-relatives/revise-object-relatives.mjs', import.meta.url)
  .pathname;

const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': 'The helper reports the source it names.\n',
  'src/notes.md': 'The cache is cold\u{2014}so the transport reconnects.\n',
};

describe('the deployed bundle', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'revise-prose-bundle-'));
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    for (const [file, content] of Object.entries(FIXTURE_FILES)) {
      await mkdir(path.join(scratch, path.dirname(file)), { recursive: true });
      await writeFile(path.join(scratch, file), content, 'utf8');
    }
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('sweeps and reports JSON on the pre-rules invocation', () => {
    const result = sweepResult([]);

    expect(result.summary.byRule).toStrictEqual({ 'em-dash': 0, 'reduced-object-relative': 1 });
    expect(result.batches.length).toBeGreaterThan(0);
  });

  it('detects the rules its invocation names', () => {
    const result = sweepResult(['--unit', 'writing=2', '--rule', 'em-dash=writing']);

    expect(result.summary.byRule).toStrictEqual({ 'em-dash': 1, 'reduced-object-relative': 0 });
  });

  it('reports an invalid invocation as a structured failure at exit 0', () => {
    expect(run(['--nonesuch'])).toMatchObject({ ok: false, error: 'invalid-args' });
  });

  it('writes the record through its record command, reading the fold on standard input', async () => {
    const fold = {
      sweptAt: '2026-09-02',
      units: { writing: { version: '2', roots: ['.'] } },
      rejections: [],
    };
    const result = run(['record'], JSON.stringify(fold));

    expect(result).toMatchObject({ ok: true, path: '.agents/revise-prose.yaml' });
    const written = await readFile(path.join(scratch, '.agents/revise-prose.yaml'), 'utf8');
    expect(written).toContain('version: "2"');
  });

  // region | Helpers

  /** Runs the bundle against the fixture repository and parses its stdout, which is one JSON object. */
  function run(argv: readonly string[], stdin?: string): unknown {
    const stdout = execFileSync('node', [BUNDLE, ...argv], {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, HOME: scratch },
      ...(stdin !== undefined && { input: stdin }),
    });
    return JSON.parse(stdout);
  }

  /** Runs a sweep and narrows its result to the success arm, failing with the helper's own message when it is not. */
  function sweepResult(argv: readonly string[]): DetectSuccess {
    const result = run(argv);
    if (!isSweepSuccess(result)) {
      throw new Error(`expected a successful sweep, got ${JSON.stringify(result)}`);
    }
    return result;
  }

  // endregion | Helpers
});

// region | Helpers

/** Narrows the bundle's parsed stdout to a successful sweep, the process boundary offering no type of its own. */
function isSweepSuccess(value: unknown): value is DetectSuccess {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true && 'batches' in value;
}

// endregion | Helpers
