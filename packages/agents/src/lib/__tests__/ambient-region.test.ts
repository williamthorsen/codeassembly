import { describe, expect, it } from 'vitest';

import {
  extractAmbientRegionContent,
  hasAmbientRegion,
  injectAmbientRegion,
  stripAmbientRegionContent,
} from '../ambient-region.ts';

/** A rulebook sentinel block, as sync renders ambient content into the region. */
const BODY =
  '<!-- rulebook:writing-prefs -->\n# Writing preferences\n\nNo em-dashes.\n<!-- /rulebook:writing-prefs -->';

const EMPTY_REGION = '<!-- codeassembly-ambient:start -->\n<!-- codeassembly-ambient:end -->';
const FILLED_REGION = `<!-- codeassembly-ambient:start -->\n${BODY}\n<!-- codeassembly-ambient:end -->`;

/** A rendered guidance file whose template carries an empty region between foreign sections. */
const GUIDANCE = `# Guidance\n\nIntro prose.\n\n${EMPTY_REGION}\n\n## Tail section\n`;

describe(extractAmbientRegionContent, () => {
  it('returns the inner content of a filled region', () => {
    expect(extractAmbientRegionContent(injectAmbientRegion(GUIDANCE, BODY))).toBe(BODY);
  });

  it('returns an empty string for an empty region', () => {
    expect(extractAmbientRegionContent(GUIDANCE)).toBe('');
  });

  it('returns undefined when no region is present', () => {
    expect(extractAmbientRegionContent('# Guidance\n')).toBeUndefined();
  });

  it('returns undefined for an unclosed open marker', () => {
    expect(extractAmbientRegionContent('<!-- codeassembly-ambient:start -->\ncontent\n')).toBeUndefined();
  });
});

describe(hasAmbientRegion, () => {
  it('detects an empty region', () => {
    expect(hasAmbientRegion(GUIDANCE)).toBe(true);
  });

  it('detects a filled region', () => {
    expect(hasAmbientRegion(FILLED_REGION)).toBe(true);
  });

  it('returns false for region-less content', () => {
    expect(hasAmbientRegion('# Guidance\n')).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(hasAmbientRegion('')).toBe(false);
  });

  it('returns false for an unpaired close marker', () => {
    expect(hasAmbientRegion('content\n<!-- codeassembly-ambient:end -->\n')).toBe(false);
  });
});

describe(injectAmbientRegion, () => {
  it('fills an empty region, preserving surrounding content', () => {
    expect(injectAmbientRegion(GUIDANCE, BODY)).toBe(
      `# Guidance\n\nIntro prose.\n\n${FILLED_REGION}\n\n## Tail section\n`,
    );
  });

  it('replaces existing region content wholesale', () => {
    const filled = injectAmbientRegion(GUIDANCE, BODY);
    expect(injectAmbientRegion(filled, 'replacement')).toBe(
      `# Guidance\n\nIntro prose.\n\n<!-- codeassembly-ambient:start -->\nreplacement\n<!-- codeassembly-ambient:end -->\n\n## Tail section\n`,
    );
  });

  it('is idempotent for an identical body', () => {
    const once = injectAmbientRegion(GUIDANCE, BODY);
    expect(injectAmbientRegion(once, BODY)).toBe(once);
  });

  it('empties the region when the body is empty', () => {
    expect(injectAmbientRegion(injectAmbientRegion(GUIDANCE, BODY), '')).toBe(GUIDANCE);
  });

  it('leaves $-sequences in the body intact', () => {
    expect(extractAmbientRegionContent(injectAmbientRegion(GUIDANCE, "price is $' and $1"))).toBe("price is $' and $1");
  });

  it('throws when no region is present', () => {
    expect(() => injectAmbientRegion('# Guidance\n', BODY)).toThrow(/No ambient region/);
  });
});

describe(stripAmbientRegionContent, () => {
  it('empties a filled region, keeping the markers', () => {
    expect(stripAmbientRegionContent(injectAmbientRegion(GUIDANCE, BODY))).toBe(GUIDANCE);
  });

  it('leaves an already-empty region unchanged', () => {
    expect(stripAmbientRegionContent(GUIDANCE)).toBe(GUIDANCE);
  });

  it('returns region-less content unchanged', () => {
    expect(stripAmbientRegionContent('# Guidance\n')).toBe('# Guidance\n');
  });

  it('returns content with an unclosed marker unchanged', () => {
    const unclosed = '<!-- codeassembly-ambient:start -->\ncontent\n';
    expect(stripAmbientRegionContent(unclosed)).toBe(unclosed);
  });
});
