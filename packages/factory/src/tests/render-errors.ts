import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react';

import { silencedConsole, silencedWindowErrors, type ErrorFilter } from './error-suppression.ts';

/**
 * Wrapper for `renderHook` that suppresses error output triggered by a component that throws during render.
 *
 * Silences both channels:
 *  1. `console.error` — React's "The above error occurred in…" messages.
 *  2. `window` `error` events — the raw stack traces emitted by jsdom via
 *     React 18's `invokeGuardedCallbackDev`.
 *
 * Pass `expectedError` to limit window-error suppression to matching errors only.
 * Accepts a `string`, `RegExp`, predicate, or `Error` instance (uses `error.message`).
 * Unmatched errors still surface normally.
 *
 * @example
 * expect(() => {
 *   renderHookWithError(() => useMyContext(), {
 *     expectedError: /must be used within/,
 *   });
 * }).toThrow('must be used within MyProvider');
 */
export function renderHookWithError<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props> & { expectedError?: ErrorFilter | Error },
): RenderHookResult<Result, Props> {
  const { expectedError, ...hookOptions } = options ?? {};
  const filter = expectedError instanceof Error ? expectedError.message : expectedError;
  // Suppress console and window error noise for expected errors.
  using _console = silencedConsole(['error']);
  using _window = silencedWindowErrors(filter);

  return renderHook(callback, hookOptions as RenderHookOptions<Props>);
}
