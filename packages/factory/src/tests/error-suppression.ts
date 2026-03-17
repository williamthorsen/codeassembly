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
    const spy = silenceOneMethod(method);
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

/** Filter for `window` `error` events. */
export type ErrorFilter = string | RegExp | ((e: ErrorEvent) => boolean);

/**
 * Returns a disposable that suppresses matching `window` `error` events for the current scope.
 * The listener is automatically removed when the `using` block exits.
 *
 * React 18's dev build re-throws render errors inside a synthetic DOM event (`invokeGuardedCallbackDev`).
 * jsdom surfaces these via `ErrorEvent` on `window`, bypassing `console.error` entirely.
 * Calling `preventDefault()` tells jsdom not to report the error to stderr.
 *
 * Accepts a filter so only *expected* errors are suppressed — unexpected errors still surface normally.
 * The filter follows the same convention as vitest's `toThrow()`: a substring match, a regex, or a predicate function.
 * When omitted, all `window` error events are suppressed.
 *
 * Pair with {@link silencedConsole} to fully suppress expected render errors:
 *
 * @example
 * // Suppress a specific error:
 * using _window = silencedWindowErrors('must be used within');
 *
 * // Regex:
 * using _window = silencedWindowErrors(/must be used within.*Provider/);
 *
 * // Predicate:
 * using _window = silencedWindowErrors((e) => e.message.includes('Provider'));
 *
 * // Suppress all (use sparingly):
 * using _window = silencedWindowErrors();
 */
export function silencedWindowErrors(filter?: ErrorFilter): Disposable {
  const predicate = toErrorPredicate(filter);
  const suppress = (e: ErrorEvent) => {
    if (predicate(e)) e.preventDefault();
  };
  window.addEventListener('error', suppress);
  return {
    [Symbol.dispose]() {
      window.removeEventListener('error', suppress);
    },
  };
}

/** Extracts a message string from an `ErrorEvent`, handling both `Error` objects and plain strings. */
function errorMessageFrom(e: ErrorEvent): string {
  if (e.error instanceof Error) return e.error.message;
  return e.message;
}

/** Spies on a single console method and replaces it with a no-op. */
function silenceOneMethod(method: ConsoleMethod): MockInstance {
  // Split spyOn from mockImplementation so TypeScript resolves the overload union
  // without requiring literal narrowing via a switch.
  const spy = vi.spyOn(console, method);
  spy.mockImplementation(() => {});
  return spy;
}

/** Normalizes an {@link ErrorFilter} to a predicate function. */
function toErrorPredicate(filter: ErrorFilter | undefined): (e: ErrorEvent) => boolean {
  if (filter == null) return () => true;
  if (typeof filter === 'function') return filter;
  if (typeof filter === 'string') {
    return (e) => errorMessageFrom(e).includes(filter);
  }
  // RegExp
  return (e) => filter.test(errorMessageFrom(e));
}

/** Type-preserving wrapper around `Object.fromEntries`. */
function typedFromEntries<K extends string, V>(entries: Array<[K, V]>): Record<K, V> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.fromEntries loses key types; this restores them
  return Object.fromEntries(entries) as Record<K, V>;
}
