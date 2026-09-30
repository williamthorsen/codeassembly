import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it } from 'vitest';

import { configureOutputStyle, emitReport, renderReportLine } from '../emit-report.ts';

afterEach(() => {
  configureOutputStyle({ stderr: 'plain', stdout: 'plain' });
});

describe(emitReport, () => {
  // This module is the console boundary, so spying on it here is the assertion rather than a workaround.
  it('routes each line to the stream named by its level, in the order given', () => {
    using silent = silenceConsole(['error', 'info', 'warn']);

    emitReport([
      { level: 'info', text: 'first' },
      { level: 'warn', text: 'caution' },
      { level: 'error', text: 'failure' },
      { level: 'info', text: 'second' },
    ]);

    expect(silent.info.mock.calls.map((call) => String(call[0]))).toEqual(['first', 'second']);
    expect(silent.warn.mock.calls.map((call) => String(call[0]))).toEqual(['caution']);
    expect(silent.error.mock.calls.map((call) => String(call[0]))).toEqual(['failure']);
  });

  it('renders each stream in its own configured style', () => {
    using silent = silenceConsole(['info', 'warn']);
    configureOutputStyle({ stderr: 'plain', stdout: 'rich' });

    emitReport([
      { glyph: 'passed', level: 'info', text: 'done' },
      { glyph: 'warning', level: 'warn', text: 'careful' },
    ]);

    expect(silent.info.mock.calls.map((call) => String(call[0]))).toEqual(['✅ done']);
    expect(silent.warn.mock.calls.map((call) => String(call[0]))).toEqual(['WARN careful']);
  });

  it('renders plain before any style is configured', () => {
    using silent = silenceConsole(['info']);

    emitReport([{ glyph: 'passed', level: 'info', text: 'done' }]);

    expect(silent.info.mock.calls.map((call) => String(call[0]))).toEqual(['PASS done']);
  });
});

describe(renderReportLine, () => {
  it('pads every glyph to one gutter in the rich style', () => {
    expect(renderReportLine({ glyph: 'removed', level: 'info', text: 'gone' }, 'rich')).toBe('🧹 gone');
    expect(renderReportLine({ glyph: 'hint', level: 'info', text: 'idea' }, 'rich')).toBe('💡 idea');
  });

  it('pads every glyph to one gutter in the plain style', () => {
    expect(renderReportLine({ glyph: 'removed', level: 'info', text: 'gone' }, 'plain')).toBe('DEL  gone');
    expect(renderReportLine({ glyph: 'failed', level: 'error', text: 'broke' }, 'plain')).toBe('FAIL broke');
  });

  it('puts the indent before the glyph', () => {
    expect(renderReportLine({ glyph: 'warning', indent: 2, level: 'warn', text: 'x' }, 'rich')).toBe('  🟠 x');
    expect(renderReportLine({ glyph: 'warning', indent: 2, level: 'warn', text: 'x' }, 'plain')).toBe('  WARN x');
  });

  it('aligns each continuation line under the text, leaving blank lines empty', () => {
    const line = { glyph: 'warning', indent: 2, level: 'warn', text: 'head\ntail\n\nend' } as const;

    expect(renderReportLine(line, 'rich')).toBe('  🟠 head\n     tail\n\n     end');
    expect(renderReportLine(line, 'plain')).toBe('  WARN head\n       tail\n\n       end');
  });

  it('renders a line without a glyph as its indent and text, continuation lines untouched', () => {
    expect(renderReportLine({ indent: 2, level: 'info', text: 'a\nb' }, 'rich')).toBe('  a\nb');
  });
});
