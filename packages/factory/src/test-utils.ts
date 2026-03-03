import { type MockInstance, vi } from 'vitest';

interface SilencedConsole extends Disposable {
  log: MockInstance;
  error: MockInstance;
  warn: MockInstance;
  info: MockInstance;
  debug: MockInstance;
}

/**
 * Returns a disposable that silences console output for the current scope.
 * Spies are automatically restored when the `using` block exits.
 *
 * @example
 * // Just silence:
 * using _silent = silencedConsole();
 *
 * // Silence + assert:
 * using silent = silencedConsole();
 * expect(silent.error).toHaveBeenCalledWith(...);
 */
export function silencedConsole(): SilencedConsole {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

  return {
    log,
    error,
    warn,
    info,
    debug,
    [Symbol.dispose]() {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
      info.mockRestore();
      debug.mockRestore();
    },
  };
}
