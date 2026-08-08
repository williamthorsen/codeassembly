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
// A registry name the helper does not serve, so an assertion on it cannot be satisfied by the bound default.
const OTHER_STORE_NAME = 'some-other-corpus';

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
      OTHER_STORE_NAME,
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
      store: OTHER_STORE_NAME,
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

  it('resolves the store this helper serves when --store names none', () => {
    const parsed = parseArgs(['--inspect', ...requiredFlags()]);

    expect(parsed.store).toBe('codeassembly');
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

  it('refuses the @default sentinel, which names a machine setting rather than a corpus', () => {
    expect(() => parseArgs(['--inspect', '--store', '@default', ...requiredFlags()])).toThrow(
      '--store @default is not accepted',
    );
  });
});

describe(runDecision, () => {
  it('reports the resolved episode in inspect mode', async () => {
    const fixture = await createLedeFixture();

    const result = await runDecision(runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture }));

    expect(result).toMatchObject({ ok: true, mode: 'inspect' });
    expect(expectInspect(result).episode.differ).toBe(true);
  });

  it('reports the store a decision would record into', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();

    const result = await runDecision(
      runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture, home: store.home }),
    );

    expect(expectInspect(result).store).toStrictEqual({ name: STORE_NAME, reachable: true });
  });

  it('reports an unreachable store without failing the inspection', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore(OTHER_STORE_NAME);

    const result = await runDecision(
      runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture, home: store.home }),
    );

    expect(expectInspect(result).store).toMatchObject({
      name: STORE_NAME,
      reachable: false,
      error: 'store-not-registered',
    });
  });

  it('writes one event record when a verdict is recorded', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();

    const result = await runDecision(
      runInput({
        argv: ['--verdict', 'revised', ...flagsFor(fixture)],
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

    await runDecision(runInput({ argv: ['--inspect', ...flagsFor(fixture)], fixture, home: store.home }));

    await expect(readdir(join(store.storePath, 'content', 'events'))).rejects.toThrow();
  });

  it('reports a resolution failure by its own code rather than a generic error', async () => {
    const fixture = await createLedeFixture();
    const argv = ['--inspect', ...flagsFor({ ...fixture, artifactDir: join(fixture.root, 'absent') })];

    const result = await runDecision(runInput({ argv, fixture }));

    expect(expectFailure(result)).toBe('no-artifact-dir');
  });

  it('records into the store it serves when --store names none', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore();
    const argv = ['--verdict', 'accepted', ...flagsFor(fixture)];

    const result = await runDecision(runInput({ argv, fixture, home: store.home }));

    expect(expectCommit(result).store).toBe(STORE_NAME);
  });

  it('records into a corpus named by --store', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore(OTHER_STORE_NAME);
    const argv = ['--verdict', 'accepted', '--store', OTHER_STORE_NAME, ...flagsFor(fixture)];

    const result = await runDecision(runInput({ argv, fixture, home: store.home }));

    expect(expectCommit(result).store).toBe(OTHER_STORE_NAME);
  });

  it('refuses a decision where the store it serves is registered under no name', async () => {
    const fixture = await createLedeFixture();
    const store = await makeStore(OTHER_STORE_NAME);
    const argv = ['--verdict', 'accepted', ...flagsFor(fixture)];

    const result = await runDecision(runInput({ argv, fixture, home: store.home }));

    expect(expectFailure(result)).toBe('store-not-registered');
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
function expectInspect(result: DecisionResult): Extract<DecisionResult, { mode: 'inspect' }> {
  if (result.ok && result.mode === 'inspect') {
    return result;
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

/**
 * Stands up a temp event store plus an isolated home registering it, so registry resolution never reads the real one.
 * `name` registers the store under something other than the one the helper serves, which is how a test tells a default
 * that resolves to the helper's own constant from one that resolves to whatever the registry happens to hold.
 */
async function makeStore(name: string = STORE_NAME): Promise<{ storePath: string; home: string }> {
  const storePath = await mkdtemp(join(tmpdir(), 'lede-decision-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });

  const home = await mkdtemp(join(tmpdir(), 'lede-decision-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/** The three flags every invocation must carry, used to build otherwise-minimal argv in parser tests. */
function requiredFlags(): string[] {
  return ['--artifact-dir', '/tickets/1107', '--pr', '1124', '--merge-commit', '35aa58d7'];
}

/**
 * Builds runner input over a fixture, defaulting the environment so no test reads the developer's own. `home` falls back
 * to the fixture root, which carries no `.agents/kb.yaml`, so a store resolves to `not-registered` deterministically.
 */
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
    home: input.home ?? input.fixture.root,
  };
}

/** Removes a value-bearing flag and its value from an argv list, yielding the list unchanged when it is absent. */
function withoutFlag(argv: readonly string[], name: string): string[] {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? [...argv] : [...argv.slice(0, index), ...argv.slice(index + 2)];
}

// endregion | Helpers
