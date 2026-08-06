/* eslint no-console: "off" */
/* eslint-disable unicorn/no-nonstandard-builtin-properties -- unicorn's Symbol allowlist predates Explicit Resource Management, and the rule accepts no options. */
import { describe, expect, expectTypeOf, it, type MockInstance } from 'vitest';

import { silencedConsole } from '../test-utils.js';

describe('silencedConsole', () => {
  describe('type narrowing', () => {
    it('exposes only the requested methods', () => {
      const silent = silencedConsole(['error', 'warn']);
      expect(silent).toStrictEqual({
        error: expect.any(Function),
        warn: expect.any(Function),
        [Symbol.dispose]: expect.any(Function),
      });
      silent[Symbol.dispose]();
    });

    it('types each spy as MockInstance', () => {
      const silent = silencedConsole(['error']);
      expectTypeOf(silent.error).toEqualTypeOf<MockInstance>();
      silent[Symbol.dispose]();
    });

    it('is Disposable', () => {
      const silent = silencedConsole(['error']);
      expectTypeOf(silent).toExtend<Disposable>();
      silent[Symbol.dispose]();
    });
  });

  describe('runtime behavior', () => {
    it('silences the requested method', () => {
      const original = console.error;
      using _silent = silencedConsole(['error']);
      expect(console.error).not.toBe(original);
    });

    it('does not silence methods not in the list', () => {
      const originalLog = console.log;
      using _silent = silencedConsole(['error']);
      expect(console.log).toBe(originalLog);
    });

    it('records calls on the returned spy', () => {
      using silent = silencedConsole(['warn']);
      console.warn('test message', 42);
      expect(silent.warn).toHaveBeenCalledWith('test message', 42);
    });

    it('restores all spies when disposed', () => {
      const originalError = console.error;
      const originalWarn = console.warn;
      {
        using _silent = silencedConsole(['error', 'warn']);
        expect(console.error).not.toBe(originalError);
        expect(console.warn).not.toBe(originalWarn);
      }
      expect(console.error).toBe(originalError);
      expect(console.warn).toBe(originalWarn);
    });
  });
});
