import { describe, expect, it } from 'vitest';

import {
  AMBIENT_CLOSE_MARKER,
  AMBIENT_OPEN_MARKER,
  appendAmbientRegion,
  classifyAmbientRegion,
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

describe(appendAmbientRegion, () => {
  it('yields the region alone for blank content', () => {
    expect(appendAmbientRegion('', BODY)).toBe(`${FILLED_REGION}\n`);
    expect(appendAmbientRegion('\n\n', BODY)).toBe(`${FILLED_REGION}\n`);
  });

  it('keeps existing content verbatim above the appended region', () => {
    const existing = '# Personal notes\n\nMy sandbox URL.\n';

    const result = appendAmbientRegion(existing, BODY);

    expect(result.startsWith(existing)).toBe(true);
    expect(result).toBe(`${existing}\n${FILLED_REGION}\n`);
  });

  it('separates the region by exactly one blank line regardless of trailing newlines', () => {
    expect(appendAmbientRegion('# Notes', BODY)).toBe(`# Notes\n\n${FILLED_REGION}\n`);
    expect(appendAmbientRegion('# Notes\n\n\n', BODY)).toBe(`# Notes\n\n${FILLED_REGION}\n`);
  });

  it('produces content a later injection can target, so appending happens only once', () => {
    const appended = appendAmbientRegion('# Notes\n', BODY);

    expect(hasAmbientRegion(appended)).toBe(true);
    expect(injectAmbientRegion(appended, BODY)).toBe(appended);
  });
});

describe(classifyAmbientRegion, () => {
  it('reports content carrying no marker as absent', () => {
    expect(classifyAmbientRegion('# Notes\n')).toBe('absent');
    expect(classifyAmbientRegion('')).toBe('absent');
  });

  it('reports exactly one well-formed region as complete', () => {
    expect(classifyAmbientRegion(GUIDANCE)).toBe('complete');
    expect(classifyAmbientRegion(injectAmbientRegion(GUIDANCE, BODY))).toBe('complete');
  });

  it('reports an unmatched marker as malformed', () => {
    expect(classifyAmbientRegion('# Notes\n\n<!-- codeassembly-ambient:start -->\nStranded.\n')).toBe('malformed');
    expect(classifyAmbientRegion('# Notes\n\n<!-- codeassembly-ambient:end -->\n')).toBe('malformed');
  });

  it('reports a close marker preceding its open as malformed', () => {
    expect(classifyAmbientRegion(`${AMBIENT_CLOSE_MARKER}\n# Notes\n${AMBIENT_OPEN_MARKER}\n`)).toBe('malformed');
  });

  it('reports a stray open marker above a well-formed region as malformed', () => {
    const stray = `# Notes\n\n${AMBIENT_OPEN_MARKER}\nMy sandbox URL.\n\n${FILLED_REGION}\n`;

    expect(classifyAmbientRegion(stray)).toBe('malformed');
  });

  it('reports two well-formed regions as malformed', () => {
    expect(classifyAmbientRegion(`${EMPTY_REGION}\n\n# Notes\n\n${EMPTY_REGION}\n`)).toBe('malformed');
  });

  it('ignores a marker mentioned inline rather than on its own line', () => {
    expect(classifyAmbientRegion('Write `<!-- codeassembly-ambient:start -->` to open a region.\n')).toBe('absent');
    expect(classifyAmbientRegion(`${GUIDANCE}\nWrite \`${AMBIENT_OPEN_MARKER}\` to open one.\n`)).toBe('complete');
  });
});

describe('single-region invariant', () => {
  it('refuses to inject into a host whose stray marker would put user text inside the replaced span', () => {
    const stray = `# Notes\n\n${AMBIENT_OPEN_MARKER}\nMy sandbox URL.\nTeam on-call rota.\n\n${FILLED_REGION}\n`;

    expect(() => injectAmbientRegion(stray, BODY)).toThrow();
    expect(hasAmbientRegion(stray)).toBe(false);
  });

  it('refuses to inject into a host carrying two regions, which would leave the second stale', () => {
    const doubled = `${FILLED_REGION}\n\n# Notes\n\n${FILLED_REGION}\n`;

    expect(() => injectAmbientRegion(doubled, BODY)).toThrow();
  });

  it('leaves a host it refuses to inject into unchanged under strip as well', () => {
    const doubled = `${FILLED_REGION}\n\n# Notes\n\n${FILLED_REGION}\n`;

    expect(stripAmbientRegionContent(doubled)).toBe(doubled);
  });

  it('extracts nothing from a host it refuses to inject into, so a re-render cannot absorb foreign text', () => {
    const stray = `# Notes\n\n${AMBIENT_OPEN_MARKER}\nMy sandbox URL.\n\n${FILLED_REGION}\n`;
    const doubled = `${FILLED_REGION}\n\n# Notes\n\n${FILLED_REGION}\n`;

    expect(extractAmbientRegionContent(stray)).toBeUndefined();
    expect(extractAmbientRegionContent(doubled)).toBeUndefined();
  });
});

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
