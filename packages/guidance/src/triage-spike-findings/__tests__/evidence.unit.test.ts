import { describe, expect, it } from 'vitest';

import { parseEvidenceBlock, renderEvidenceBlock } from '../evidence.ts';
import { renderDispositionsComment } from '../render.ts';
import { buildItem, buildRecord } from '../test-utils/build-record.ts';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

describe(parseEvidenceBlock, () => {
  it('reads back every item with evidence from a rendered comment', () => {
    const comment = renderDispositionsComment(
      buildRecord({
        commit: COMMIT,
        items: [
          buildItem({ id: '10', ticket: 282, evidence: { key: 'src/a.ts:long-function', paths: ['src/a.ts'] } }),
          buildItem({
            id: '27',
            disposition: 'merge',
            target: '10',
            evidence: { key: 'src/b.ts:dup', paths: ['src/b.ts', 'src/c.ts'] },
          }),
          buildItem({
            id: '16',
            disposition: 'drop',
            confidence: 'low',
            evidence: { key: 'src/d.ts:dead-code', paths: ['src/d.ts'] },
          }),
          buildItem({ id: '24', disposition: 'comment', target: 272 }),
        ],
      }),
    );

    expect(parseEvidenceBlock(comment)).toEqual({
      version: 1,
      source: 'spike #270',
      triageTicket: 278,
      commit: COMMIT,
      items: [
        { id: '10', key: 'src/a.ts:long-function', paths: ['src/a.ts'], disposition: 'ticket', where: 282 },
        { id: '27', key: 'src/b.ts:dup', paths: ['src/b.ts', 'src/c.ts'], disposition: 'merge', where: '10' },
        { id: '16', key: 'src/d.ts:dead-code', paths: ['src/d.ts'], disposition: 'drop', where: null },
      ],
    });
  });

  it('keeps a key containing the comment terminator intact', () => {
    const key = 'src/a.ts:arrow-->chain';
    const block = renderEvidenceBlock(
      buildRecord({ commit: COMMIT, items: [buildItem({ evidence: { key, paths: ['src/a.ts'] } })] }),
    );

    expect(block?.match(/-->/g)).toHaveLength(1);
    expect(parseEvidenceBlock(block ?? '')?.items[0]?.key).toBe(key);
  });

  it.each([
    ['a body without a block', 'Just prose.'],
    ['a block of another version', '<!-- codeassembly:triage-evidence v2\n{}\n-->'],
    ['a block with malformed JSON', '<!-- codeassembly:triage-evidence v1\n{not json\n-->'],
    ['a block whose payload fails the schema', '<!-- codeassembly:triage-evidence v1\n{"version":1}\n-->'],
  ])('returns undefined for %s', (_label, body) => {
    expect(parseEvidenceBlock(body)).toBeUndefined();
  });
});

describe(renderEvidenceBlock, () => {
  it('returns undefined when no item has evidence', () => {
    expect(renderEvidenceBlock(buildRecord({ commit: COMMIT }))).toBeUndefined();
    expect(renderDispositionsComment(buildRecord())).not.toContain('codeassembly:triage-evidence');
  });

  it('places the block after every other section', () => {
    const comment = renderDispositionsComment(
      buildRecord({ commit: COMMIT, notes: ['A note.'], items: [buildItem({ evidence: { key: 'k', paths: ['p'] } })] }),
    );

    expect(comment.trimEnd().endsWith('-->')).toBe(true);
    expect(comment.indexOf('## Labels and follow-ups')).toBeLessThan(
      comment.indexOf('<!-- codeassembly:triage-evidence'),
    );
  });
});
