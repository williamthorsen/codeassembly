import { describe, expect, it } from 'vitest';

import { detectEmDashes } from '../detect-em-dash.ts';
import { isRuleId, RULE_DETECTORS, RULE_IDS } from '../rules.ts';
import type { EmDashCandidate, ProseSpan } from '../types.ts';

const EM_DASH = '\u{2014}';

describe(detectEmDashes, () => {
  it('reports a sentence holding an em-dash, with the sentence as the phrase', () => {
    const candidates = detect(`The cache is cold${EM_DASH}so the transport reconnects.`);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toStrictEqual({
      rule: 'em-dash',
      file: 'docs/guide.md',
      line: 1,
      phrase: `The cache is cold${EM_DASH}so the transport reconnects.`,
      sentence: `The cache is cold${EM_DASH}so the transport reconnects.`,
    });
  });

  it('passes over a double hyphen, which is the form the rule asks for', () => {
    expect(detect('The cache is cold--so the transport reconnects.')).toStrictEqual([]);
  });

  it('passes over an en-dash, which the rule does not govern', () => {
    expect(detect('The range is 3\u{2013}5 seconds.')).toStrictEqual([]);
  });

  it('reports one candidate for a sentence holding two em-dashes', () => {
    const candidates = detect(`One${EM_DASH}two${EM_DASH}three is a sentence.`);

    expect(candidates).toHaveLength(1);
  });

  it('reports each sentence separately', () => {
    const candidates = detect(`First${EM_DASH}here. Second${EM_DASH}there.`);

    expect(candidates.map((candidate) => candidate.sentence)).toStrictEqual([
      `First${EM_DASH}here.`,
      `Second${EM_DASH}there.`,
    ]);
  });

  it('passes over an em-dash inside an inline code span', () => {
    expect(detect(`Write \`a${EM_DASH}b\` in the config.`)).toStrictEqual([]);
  });

  it('passes over an em-dash inside a doubled-backtick span, which may hold a backtick of its own', () => {
    expect(detect(`Write \`\`a\`${EM_DASH}b\`\` in the config.`)).toStrictEqual([]);
  });

  it('reports an em-dash outside a code span on a line that also holds one', () => {
    const candidates = detect(`Use \`--force\` here${EM_DASH}never elsewhere.`);

    expect(candidates).toHaveLength(1);
  });

  it('reports an em-dash where an unclosed backtick run delimits no span', () => {
    const candidates = detect(`A stray \` backtick${EM_DASH}then a dash.`);

    expect(candidates).toHaveLength(1);
  });

  it('still recognizes a code span following an unclosed backtick run', () => {
    expect(detect(`A stray \`\` opener and \`b${EM_DASH}c\` in code.`)).toStrictEqual([]);
  });

  it('reports the line on which the sentence begins, not the first line of the span', () => {
    const candidates = detectEmDashes([
      { file: 'docs/guide.md', line: 7, text: `First sentence.\nSecond${EM_DASH}here.` },
    ]);

    expect(candidates[0]?.line).toBe(8);
  });

  it('flattens the whitespace of a sentence broken across lines', () => {
    const candidates = detectEmDashes([
      { file: 'docs/guide.md', line: 1, text: `A sentence${EM_DASH}broken\nacross two lines.` },
    ]);

    expect(candidates[0]?.sentence).toBe(`A sentence${EM_DASH}broken across two lines.`);
  });
});

describe('the rule registry', () => {
  it('names every rule it holds a detector for', () => {
    expect(RULE_IDS.toSorted()).toStrictEqual(Object.keys(RULE_DETECTORS).toSorted());
  });

  it('recognizes each known rule and nothing else', () => {
    for (const rule of RULE_IDS) {
      expect(isRuleId(rule)).toBe(true);
    }
    expect(isRuleId('sentence-case')).toBe(false);
  });
});

// region | Helpers

/** Detects over one single-line Markdown span, which is the shape every assertion above reads. */
function detect(text: string): EmDashCandidate[] {
  const span: ProseSpan = { file: 'docs/guide.md', line: 1, text };
  return detectEmDashes([span]);
}

// endregion | Helpers
