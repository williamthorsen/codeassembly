import { describe, expect, it } from 'vitest';

import { type ContentDefect, formatContentDefects } from '../content-defects.ts';

describe('formatContentDefects', () => {
  it('groups defects under one heading per file', () => {
    const rendered = formatContentDefects([
      { file: 'rulebooks/beta.md', kind: 'resolution', detail: 'Second' },
      { file: 'rulebooks/alpha.md', kind: 'resolution', detail: 'First' },
      { file: 'rulebooks/alpha.md', kind: 'render', detail: 'Also first' },
    ]);

    expect(rendered).toBe(
      [
        'rulebooks/alpha.md',
        '  [render] Also first',
        '  [resolution] First',
        '',
        'rulebooks/beta.md',
        '  [resolution] Second',
      ].join('\n'),
    );
  });

  it('orders files, then kinds, then details, so two runs read alike', () => {
    const defects: ReadonlyArray<ContentDefect> = [
      { file: 'b.md', kind: 'root', detail: 'z' },
      { file: 'a.md', kind: 'resolution', detail: 'b' },
      { file: 'a.md', kind: 'resolution', detail: 'a' },
      { file: 'a.md', kind: 'collision', detail: 'c' },
    ];

    expect(formatContentDefects(defects)).toBe(formatContentDefects(defects.toReversed()));
    expect(formatContentDefects(defects)).toBe(
      ['a.md', '  [collision] c', '  [resolution] a', '  [resolution] b', '', 'b.md', '  [root] z'].join('\n'),
    );
  });

  it('indents a multi-line detail under its own block', () => {
    expect(formatContentDefects([{ file: 'a.md', kind: 'render', detail: 'first\nsecond' }])).toBe(
      ['a.md', '  [render] first', '    second'].join('\n'),
    );
  });

  it('renders an empty defect list as an empty string', () => {
    expect(formatContentDefects([])).toBe('');
  });
});
