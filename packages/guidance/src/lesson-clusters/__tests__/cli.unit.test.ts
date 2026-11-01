import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildHelp, type CommandResult, DEFAULT_DEFER_DAYS, runCli } from '../cli.ts';
import { makeStore, seedEvents } from '../test-utils/seed-store.ts';

const NOW = new Date('2026-11-01T00:00:00Z');
const RECENT_TRIAGE = '~/ai-artifacts/feedback-triage/20261020-120000Z_triage_feedback-triage.md';

/** A fixture store with four events, one of them deferred recently, and helpers bound to its work directory. */
interface Fixture {
  home: string;
  work: string;
  run: (...argv: string[]) => Promise<CommandResult>;
  writeMap: (clusters: Array<{ id: string; lesson: string; eventIds: string[] }>) => Promise<void>;
  readJson: (name: string) => Promise<unknown>;
}

/** Creates the fixture store, its home, and a work directory, and writes the inventory when asked. */
async function setUp(options: { inventory?: boolean } = {}): Promise<Fixture> {
  const { storePath, home } = await makeStore('fixture');
  const work = await mkdtemp(join(tmpdir(), 'lesson-clusters-work-'));
  await seedEvents(storePath, [
    { id: '01A', capturedAt: '2026-10-01T00:00:00Z' },
    { id: '01B', capturedAt: '2026-10-05T00:00:00Z', impact: 'high' },
    { id: '01C', capturedAt: '2026-09-01T00:00:00Z' },
    { id: '01D', capturedAt: '2026-08-01T00:00:00Z', tags: ['feedback', 'deferred'], addressedBy: [RECENT_TRIAGE] },
  ]);
  const fixture: Fixture = {
    home,
    work,
    run: (...argv) => runCli(argv, { cwd: work, home, now: NOW }),
    writeMap: (clusters) => writeFile(join(work, 'map.json'), JSON.stringify({ clusters }), 'utf8'),
    readJson: async (name) => {
      const value: unknown = JSON.parse(await readFile(join(work, name), 'utf8'));
      return value;
    },
  };
  if (options.inventory === true) {
    await fixture.run('inventory', '--store', '@feedback', '--out', 'inventory.json');
  }
  return fixture;
}

/** Runs the clusters command over the fixture's inventory and map, with extra flags. */
function runClusters(fixture: Fixture, ...extra: string[]): Promise<CommandResult> {
  return fixture.run('clusters', '--inventory', 'inventory.json', '--map', 'map.json', '--out', 'out.json', ...extra);
}

describe(buildHelp, () => {
  it.each(['inventory', 'clusters', '--store', '--inventory', '--map', '--defer-days', '--out'])('names %s', (word) => {
    expect(buildHelp()).toContain(word);
  });
});

describe('inventory', () => {
  it('resolves @feedback and writes the pool and the deferred events', async () => {
    const fixture = await setUp();
    const result = await fixture.run('inventory', '--store', '@feedback', '--out', 'inventory.json');
    expect(result).toMatchObject({ ok: true, store: 'fixture', pool: 3, deferred: 1, skipped: [] });
    await expect(fixture.readJson('inventory.json')).resolves.toMatchObject({ store: 'fixture' });
  });

  it('refuses an omitted store', async () => {
    const fixture = await setUp();
    await expect(fixture.run('inventory', '--out', 'inventory.json')).resolves.toMatchObject({
      ok: false,
      error: 'missing-store',
    });
  });
});

describe('clusters', () => {
  it('writes the eligible clusters in signal order and excludes a recently deferred one', async () => {
    const fixture = await setUp({ inventory: true });
    await fixture.writeMap([
      { id: 'small', lesson: 'Small lesson', eventIds: ['01C'] },
      { id: 'big', lesson: 'Big lesson', eventIds: ['01A', '01B'] },
      { id: 'parked', lesson: 'Parked lesson', eventIds: ['01D'] },
    ]);

    await expect(runClusters(fixture)).resolves.toMatchObject({
      ok: true,
      deferDays: DEFAULT_DEFER_DAYS,
      clusters: 2,
      events: 3,
      excluded: 1,
    });
    await expect(fixture.readJson('out.json')).resolves.toMatchObject({
      clusters: [{ id: 'big' }, { id: 'small' }],
      excluded: [{ id: 'parked' }],
    });
  });

  it('refuses a map with violations, listing each, and writes nothing', async () => {
    const fixture = await setUp({ inventory: true });
    await fixture.writeMap([{ id: 'one', lesson: 'L', eventIds: ['01A', 'nope'] }]);

    const result = await runClusters(fixture);

    expect(result).toMatchObject({ ok: false, error: 'invalid-map' });
    expect(result.ok ? [] : result.violations?.map((violation) => violation.code)).toEqual([
      'unknown-event',
      'missing-event',
      'missing-event',
      'missing-event',
    ]);
    await expect(fixture.readJson('out.json')).rejects.toThrow();
  });
});

describe('deferral interval', () => {
  /** Sets up a fixture whose map puts the deferred event in a cluster of its own. */
  async function setUpParked(): Promise<Fixture> {
    const fixture = await setUp({ inventory: true });
    await fixture.writeMap([
      { id: 'open', lesson: 'Open', eventIds: ['01A', '01B', '01C'] },
      { id: 'parked', lesson: 'Parked', eventIds: ['01D'] },
    ]);
    return fixture;
  }

  it('takes triage_feedback.defer_days from the preferences', async () => {
    const fixture = await setUpParked();
    await writeFile(join(fixture.home, '.agents', 'preferences.yaml'), 'triage_feedback:\n  defer_days: 5\n', 'utf8');
    await expect(runClusters(fixture)).resolves.toMatchObject({ ok: true, deferDays: 5, excluded: 0 });
  });

  it('lets --defer-days override the preference', async () => {
    const fixture = await setUpParked();
    await writeFile(join(fixture.home, '.agents', 'preferences.yaml'), 'triage_feedback:\n  defer_days: 5\n', 'utf8');
    await expect(runClusters(fixture, '--defer-days', '60')).resolves.toMatchObject({
      ok: true,
      deferDays: 60,
      excluded: 1,
    });
  });

  it('returns a deferred cluster under --defer-days 0', async () => {
    const fixture = await setUpParked();
    await expect(runClusters(fixture, '--defer-days', '0')).resolves.toMatchObject({
      ok: true,
      clusters: 2,
      excluded: 0,
    });
  });

  it.each(['-1', '1.5', 'soon'])('refuses --defer-days %s', async (value) => {
    const fixture = await setUpParked();
    await expect(runClusters(fixture, '--defer-days', value)).resolves.toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
  });
});

describe('arguments', () => {
  it('refuses an unknown command', async () => {
    const fixture = await setUp();
    await expect(fixture.run('cluster')).resolves.toMatchObject({ ok: false, error: 'invalid-args' });
  });

  it('refuses a missing --out', async () => {
    const fixture = await setUp();
    await expect(fixture.run('inventory', '--store', '@feedback')).resolves.toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
  });
});
