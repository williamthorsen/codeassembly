import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { emitReport } from '../emit-report.ts';

describe(emitReport, () => {
  // This module is the console boundary, so spying on it here is the assertion rather than a workaround.
  it('routes each line to the stream named by its level, in the order given', () => {
    using silent = silenceConsole(['info', 'warn']);

    emitReport([
      { level: 'info', text: 'first' },
      { level: 'warn', text: 'caution' },
      { level: 'info', text: 'second' },
    ]);

    expect(silent.info.mock.calls.map((call) => String(call[0]))).toEqual(['first', 'second']);
    expect(silent.warn.mock.calls.map((call) => String(call[0]))).toEqual(['caution']);
  });
});
