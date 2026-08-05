import { createLaneState, type LaneState } from 'codeassembly-lifecycle';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ForgeAdapter, PrFacts, TicketFacts } from '../adapter.ts';
import { type ForgePoller, startForgePoller } from '../poller.ts';

const REPO = 'acme/app';
const FIXED_MS = Date.parse('2026-07-19T12:00:00.000Z');
const FIXED_ISO = new Date(FIXED_MS).toISOString();
const LONG_INTERVAL = 1_000_000_000;

const PR: PrFacts = {
  number: 5,
  title: 'Add it',
  url: 'https://x/pull/5',
  state: 'open',
  isDraft: false,
  checks: 'passing',
  review: undefined,
};
const TICKET: TicketFacts = {
  title: 'Fix it',
  state: 'open',
  url: 'https://x/issues/984',
  createdAt: '2026-07-01T00:00:00Z',
  labels: ['bug'],
};

const pollers: ForgePoller[] = [];

afterEach(() => {
  const pending = [...pollers];
  pollers.length = 0;
  for (const poller of pending) {
    poller.stop();
  }
  vi.useRealTimers();
});

describe('startForgePoller', () => {
  it('folds a successful round into the per-lane cache and fires onUpdate once', async () => {
    const onUpdate = vi.fn();
    const poller = startTestPoller({
      adapter: composeAdapter(() => Promise.resolve({ branchPrs: { '984': PR }, tickets: { '984': TICKET } })),
      listLanes: () => [composeLane('984')],
      onUpdate,
    });

    await poller.tick();

    expect(poller.getFacts(REPO, '984')).toEqual({ pr: PR, ticket: TICKET, fetchedAt: FIXED_ISO, stale: false });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('sends only bare-numeric ticket ids to the adapter, never Jira-style refs', async () => {
    const fetchRepoState = vi.fn(() => Promise.resolve({ branchPrs: {}, tickets: {} }));
    const poller = startTestPoller({
      adapter: { fetchRepoState },
      listLanes: () => [composeLane('984'), composeLane('MAC-130')],
    });

    await poller.tick();

    expect(fetchRepoState).toHaveBeenCalledWith({ repo: REPO, branches: ['984', 'MAC-130'], ticketIds: ['984'] });
  });

  it('marks facts stale on a repo failure and clears it on recovery, retaining facts throughout', async () => {
    let round = 0;
    const poller = startTestPoller({
      adapter: composeAdapter(() => {
        round += 1;
        if (round === 2) {
          return Promise.reject(new Error('network down'));
        }
        return Promise.resolve({ branchPrs: { '984': PR }, tickets: {} });
      }),
      listLanes: () => [composeLane('984')],
    });

    await poller.tick();
    expect(poller.getFacts(REPO, '984')).toMatchObject({ pr: PR, stale: false });

    await poller.tick();
    expect(poller.getFacts(REPO, '984')).toMatchObject({ pr: PR, stale: true });

    await poller.tick();
    expect(poller.getFacts(REPO, '984')).toMatchObject({ pr: PR, stale: false });
  });

  it('records a first-poll failure as stale with no facts', async () => {
    const poller = startTestPoller({
      adapter: composeAdapter(() => Promise.reject(new Error('unreachable'))),
      listLanes: () => [composeLane('984')],
    });

    await poller.tick();

    expect(poller.getFacts(REPO, '984')).toEqual({
      pr: undefined,
      ticket: undefined,
      fetchedAt: FIXED_ISO,
      stale: true,
    });
  });

  it('skips a tick fired while a previous round is still in flight', async () => {
    const gate = Promise.withResolvers<undefined>();
    const fetchRepoState = vi.fn(async () => {
      await gate.promise;
      return { branchPrs: {}, tickets: {} };
    });
    const poller = startTestPoller({ adapter: { fetchRepoState }, listLanes: () => [composeLane('984')] });

    const first = poller.tick();
    const second = poller.tick();
    gate.resolve(undefined);
    await Promise.all([first, second]);

    expect(fetchRepoState).toHaveBeenCalledTimes(1);
  });

  it('evicts a lane from the cache once it leaves the resident set', async () => {
    let lanes = [composeLane('984')];
    const poller = startTestPoller({
      adapter: composeAdapter(() => Promise.resolve({ branchPrs: { '984': PR }, tickets: {} })),
      listLanes: () => lanes,
    });

    await poller.tick();
    expect(poller.getFacts(REPO, '984')).toBeDefined();

    lanes = [];
    await poller.tick();
    expect(poller.getFacts(REPO, '984')).toBeUndefined();
  });

  it('is inert when no adapter is configured', async () => {
    const onUpdate = vi.fn();
    const listLanes = vi.fn(() => [composeLane('984')]);
    const poller = startTestPoller({ adapter: undefined, listLanes, onUpdate });

    await poller.tick();

    expect(poller.getFacts(REPO, '984')).toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(listLanes).not.toHaveBeenCalled();
  });

  it('polls on the configured interval and stops after stop()', async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    const poller = startForgePoller({
      adapter: composeAdapter(() => Promise.resolve({ branchPrs: {}, tickets: {} })),
      intervalMs: 100,
      listLanes: () => [],
      log: () => {},
      now: () => FIXED_MS,
      onUpdate,
    });
    pollers.push(poller);

    await vi.advanceTimersByTimeAsync(350);
    expect(onUpdate).toHaveBeenCalledTimes(3);

    poller.stop();
    await vi.advanceTimersByTimeAsync(300);
    expect(onUpdate).toHaveBeenCalledTimes(3);
  });
});

// region | Helpers

/** Wraps a `fetchRepoState` implementation as a `ForgeAdapter`. */
function composeAdapter(fetchRepoState: ForgeAdapter['fetchRepoState']): ForgeAdapter {
  return { fetchRepoState };
}

/** A lane in the test repo whose ticket ref is parsed from `branch`. */
function composeLane(branch: string): LaneState {
  return createLaneState({ repo: REPO, branch });
}

/** Starts a poller with test defaults on a non-firing interval, registering it for cleanup. */
function startTestPoller(overrides: Partial<Parameters<typeof startForgePoller>[0]>): ForgePoller {
  const poller = startForgePoller({
    adapter: undefined,
    intervalMs: LONG_INTERVAL,
    listLanes: () => [],
    log: () => {},
    now: () => FIXED_MS,
    onUpdate: () => {},
    ...overrides,
  });
  pollers.push(poller);
  return poller;
}

// endregion | Helpers
