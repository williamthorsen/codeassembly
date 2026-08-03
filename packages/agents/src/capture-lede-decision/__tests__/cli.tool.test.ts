import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { parseArgs, runDecision } from '../cli.ts';
import { createLedeFixture, type LedeFixture } from '../test-utils/create-lede-fixture.ts';
import type { DecisionResult } from '../types.ts';

const NOW = new Date('2026-07-30T20:41:17.000Z');
const STORE_NAME = 'codeassembly';

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--verdict',
      'revised',
      '--artifact-dir',
      '/tickets/1107',
      '--pr',
      '1124',
      '--merge-commit',
      '35aa58d7',
      '--data-dir',
      '/skills/_data',
      '--store',
      STORE_NAME,
      '--type',
      'feat',
      '--scope',
      'agents',
      '--ticket',
      '1107',
      '--agent-lede-file',
      '/tmp/agent.md',
      '--merged-lede-file',
      '/tmp/merged.md',
      '--manifest',
      '/tmp/manifest.json',
      '--harness',
      'claude',
    ]);

    expect(parsed).toStrictEqual({
      mode: 'commit',
      verdict: 'revised',
      artifactDir: '/tickets/1107',
      pr: '1124',
      mergeCommit: '35aa58d7',
      dataDir: '/skills/_data',
      store: STORE_NAME,
      type: 'feat',
      scope: 'agents',
      ticket: '1107',
      agentLedeFile: '/tmp/agent.md',
      mergedLedeFile: '/tmp/merged.md',
      manifest: '/tmp/manifest.json',
      harness: 'claude',
    });
  });

  it('selects inspect mode and leaves the verdict unset', () => {
    const parsed = parseArgs(['--inspect', ...requiredFlags()]);

    expect(parsed.mode).toBe('inspect');
    expect(parsed.verdict).toBeNull();
  });

  it.each([['artifact-dir'], ['pr'], ['merge-commit']])('requires --%s', (name) => {
    const argv = withoutFlag(['--inspect', ...requiredFlags()], name);

    expect(() => parseArgs(argv)).toThrow(`--${name} is required`);
  });

  it('refuses an invocation that selects both modes', () => {
    expect(() => parseArgs(['--inspect', '--verdict', 'revised', ...requiredFlags()])).toThrow('mutually exclusive');
  });

  it('refuses an invocation that selects neither mode', () => {
    expect(() => parseArgs(requiredFlags())).toThrow('one of --inspect or --verdict');
  });

  it('refuses a verdict outside the declared set', () => {
    expect(() => parseArgs(['--verdict', 'maybe', ...requiredFlags()])).toThrow('--verdict must be one of');
  });
});

describe(runDecision, () => {
  it('reports the resolved episode in inspect mode', async () => {
    const fixture = await createLedeFixture();

    const result = await runDecision(runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture }));

    expect(result).toMatchObject({ ok: true, mode: 'inspect' });
    expect(expectInspect(result).differ).toBe(true);
  });

  it('needs no store in inspect mode, so resolving one cannot block a report', async () => {
    const fixture = await createLedeFixture();

    const result = await runDecision(runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture, home: undefined }));

    expect(result.ok).toBe(true);
  });

  it('writes one event record when a verdict is recorded', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();

    const result = await runDecision(
      runInput({
        argv: ['--verdict', 'revised', '--store', STORE_NAME, ...flagsFor(fixture)],
        fixture,
        home: store.home,
        comment: 'Cut the setup clause.',
      }),
    );

    const written = expectCommit(result);
    expect(written.store).toBe(STORE_NAME);
    const content = await readFile(written.path, 'utf8');
    expect(content).toMatch(/^tags: \[lede-decision, type:feat, revised]$/m);
    expect(content).toContain('## Comment\n\nCut the setup clause.');
  });

  it('writes nothing in inspect mode', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();

    await runDecision(
      runInput({ argv: ['--inspect', '--store', STORE_NAME, ...flagsFor(fixture)], fixture, home: store.home }),
    );

    await expect(readdir(join(store.storePath, 'content', 'events'))).rejects.toThrow();
  });

  it('reports a resolution failure by its own code rather than a generic error', async () => {
    const fixture = await createLedeFixture();
    const argv = ['--inspect', ...flagsFor({ ...fixture, artifactDir: join(fixture.root, 'absent') })];

    const result = await runDecision(runInput({ argv, fixture }));

    expect(expectFailure(result)).toBe('no-artifact-dir');
  });

  it('refuses to record a decision with no named store', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();
    const argv = ['--verdict', 'accepted', ...flagsFor(fixture)];

    const result = await runDecision(runInput({ argv, fixture, home: store.home }));

    expect(expectFailure(result)).toBe('missing-store');
  });

  it('reports an invalid invocation without touching the artifacts', async () => {
    const fixture = await createLedeFixture();

    const result = await runDecision(runInput({ argv: ['--inspect'], fixture }));

    expect(expectFailure(result)).toBe('invalid-args');
  });
});

// region | Helpers

/** Narrows a result to a recorded decision, failing the test with the reported reason when it is not one. */
function expectCommit(result: DecisionResult): Extract<DecisionResult, { mode: 'commit' }> {
  if (result.ok && result.mode === 'commit') {
    return result;
  }
  throw new Error(`expected a recorded decision, got ${JSON.stringify(result)}`);
}

/** Narrows a result to its failure arm and yields the error code, failing the test when it succeeded. */
function expectFailure(result: DecisionResult): string {
  if (result.ok) {
    throw new Error(`expected a failure, got ${JSON.stringify(result)}`);
  }
  return result.error;
}

/** Narrows a result to an inspect report, failing the test when it is not one. */
function expectInspect(result: DecisionResult): Extract<DecisionResult, { mode: 'inspect' }>['episode'] {
  if (result.ok && result.mode === 'inspect') {
    return result.episode;
  }
  throw new Error(`expected an inspect report, got ${JSON.stringify(result)}`);
}

/** The flags a merge caller supplies, pointing at a fixture tree. */
function flagsFor(fixture: Pick<LedeFixture, 'artifactDir' | 'dataDir' | 'manifestPath'>): string[] {
  return [
    '--artifact-dir',
    fixture.artifactDir,
    '--data-dir',
    fixture.dataDir,
    '--manifest',
    fixture.manifestPath,
    '--pr',
    '1124',
    '--merge-commit',
    '35aa58d7',
    '--type',
    'feat',
    '--scope',
    'agents',
  ];
}

/** Stands up a temp event store plus an isolated home registering it, so registry resolution never reads the real one. */
async function makeStore(): Promise<{ storePath: string; home: string }> {
  const storePath = await mkdtemp(join(tmpdir(), 'lede-decision-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });

  const home = await mkdtemp(join(tmpdir(), 'lede-decision-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${STORE_NAME}\nkbs:\n  ${STORE_NAME}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/** The three flags every invocation must carry, used to build otherwise-minimal argv in parser tests. */
function requiredFlags(): string[] {
  return ['--artifact-dir', '/tickets/1107', '--pr', '1124', '--merge-commit', '35aa58d7'];
}

/** Builds runner input over a fixture, defaulting the environment so no test reads the developer's own. */
function runInput(input: {
  argv: string[];
  fixture: LedeFixture;
  home?: string | undefined;
  comment?: string;
}): Parameters<typeof runDecision>[0] {
  return {
    argv: input.argv,
    stdin: Readable.from([Buffer.from(input.comment ?? '', 'utf8')]),
    cwd: input.fixture.root,
    env: {},
    now: NOW,
    defaultDataDir: input.fixture.dataDir,
    ...(input.home !== undefined && { home: input.home }),
  };
}

/** Removes a value-bearing flag and its value from an argv list, yielding the list unchanged when it is absent. */
function withoutFlag(argv: readonly string[], name: string): string[] {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? [...argv] : [...argv.slice(0, index), ...argv.slice(index + 2)];
}

// endregion | Helpers
