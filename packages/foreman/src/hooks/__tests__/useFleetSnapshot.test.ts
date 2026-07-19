import type { FleetSnapshot } from '@codeassembly/fleet';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFleetSnapshot } from '../useFleetSnapshot.ts';

// jsdom has no EventSource; the hook's contract with it is exercised through this fake.
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  closed = false;
  readonly url: string;
  private readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const registered = this.listeners.get(type) ?? new Set();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: 'error' | 'open'): void {
    this.dispatch(type, new MessageEvent(type));
  }

  emitMessage(data: string): void {
    this.dispatch('message', new MessageEvent('message', { data }));
  }

  private dispatch(type: string, event: MessageEvent<string>): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function buildSnapshot(branch: string): FleetSnapshot {
  return {
    lanes: [
      {
        repo: 'owner/repo',
        branch,
        ticketRef: null,
        open: true,
        closedReason: null,
        lastEventTs: '2026-07-19T12:00:00.000Z',
        sessions: [],
      },
    ],
  };
}

/** The single EventSource the rendered hook opened. */
function getOpenedSource(): FakeEventSource {
  const source = FakeEventSource.instances[0];
  if (source === undefined) {
    throw new Error('The hook opened no EventSource');
  }
  return source;
}

function stubFetchResolving(snapshot: FleetSnapshot): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(snapshot)));
}

describe('useFleetSnapshot', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the fetched snapshot before any stream frame arrives', async () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { result } = renderHook(() => useFleetSnapshot());

    await waitFor(() => {
      expect(result.current.snapshot?.lanes[0]?.branch).toBe('fetched');
    });
  });

  it('replaces the snapshot wholesale when a stream frame arrives', () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { result } = renderHook(() => useFleetSnapshot());

    act(() => {
      getOpenedSource().emitMessage(JSON.stringify(buildSnapshot('streamed')));
    });

    expect(result.current.snapshot?.lanes[0]?.branch).toBe('streamed');
    expect(result.current.connection).toBe('live');
  });

  it('discards a fetch result that resolves after a stream frame', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    const { result } = renderHook(() => useFleetSnapshot());

    act(() => {
      getOpenedSource().emitMessage(JSON.stringify(buildSnapshot('streamed')));
    });
    await act(async () => {
      resolveFetch(Response.json(buildSnapshot('fetched')));
      // A macrotask hop: the fetch-then-json chain has fully settled by the time this resolves.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.snapshot?.lanes[0]?.branch).toBe('streamed');
  });

  it('keeps the previous snapshot when a frame is malformed', () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { result } = renderHook(() => useFleetSnapshot());

    act(() => {
      getOpenedSource().emitMessage(JSON.stringify(buildSnapshot('streamed')));
      getOpenedSource().emitMessage('not json');
    });

    expect(result.current.snapshot?.lanes[0]?.branch).toBe('streamed');
  });

  it('reports live when the stream opens', () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { result } = renderHook(() => useFleetSnapshot());
    expect(result.current.connection).toBe('connecting');

    act(() => {
      getOpenedSource().emit('open');
    });

    expect(result.current.connection).toBe('live');
  });

  it('reports reconnecting when the stream errors', () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { result } = renderHook(() => useFleetSnapshot());

    act(() => {
      getOpenedSource().emit('error');
    });

    expect(result.current.connection).toBe('reconnecting');
  });

  it('closes the event source on unmount', () => {
    stubFetchResolving(buildSnapshot('fetched'));
    const { unmount } = renderHook(() => useFleetSnapshot());

    unmount();

    expect(getOpenedSource().closed).toBe(true);
  });
});
