import { type MockInstance, vi } from 'vitest';

type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';

/**
 * Returns a disposable that silences the specified console methods for the current scope.
 * Spies are automatically restored when the `using` block exits.
 *
 * @example
 * // Just silence:
 * using _silent = silencedConsole(['error']);
 *
 * // Silence + assert:
 * using silent = silencedConsole(['error', 'warn']);
 * expect(silent.error).toHaveBeenCalledWith(...);
 */
export function silencedConsole<M extends ConsoleMethod>(methods: readonly M[]): Disposable & Record<M, MockInstance> {
  const spies: MockInstance[] = [];
  const entries: Array<[M, MockInstance]> = [];
  for (const method of methods) {
    const spy = createConsoleSpy(method);
    spies.push(spy);
    entries.push([method, spy]);
  }

  const result = typedFromEntries(entries);
  return Object.assign(result, {
    [Symbol.dispose]() {
      for (const spy of spies) {
        spy.mockRestore();
      }
    },
  });
}

/** Type-preserving wrapper around `Object.fromEntries`. */
function typedFromEntries<K extends string, V>(entries: Array<[K, V]>): Record<K, V> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.fromEntries loses key types; this restores them
  return Object.fromEntries(entries) as Record<K, V>;
}

/** Creates a mock spy on the given console method. */
function createConsoleSpy(method: ConsoleMethod): MockInstance {
  switch (method) {
    case 'debug':
      return vi.spyOn(console, 'debug').mockImplementation(() => {});
    case 'error':
      return vi.spyOn(console, 'error').mockImplementation(() => {});
    case 'info':
      return vi.spyOn(console, 'info').mockImplementation(() => {});
    case 'log':
      return vi.spyOn(console, 'log').mockImplementation(() => {});
    case 'warn':
      return vi.spyOn(console, 'warn').mockImplementation(() => {});
  }
}
