import { describe, expect, it } from 'vitest';

import { hasPromptsRegion, injectPromptsRegion, removePromptsRegion } from '../prompts-yml-region.ts';

/** A rendered entry body, as `renderPromptEntries` produces it: indented list items with a trailing newline. */
const BODY = "  - name: 'x'\n    description: 'd'\n    content_file: skills/x/SKILL.md\n";
/** The sentinel-wrapped region for `BODY`, with no surrounding newlines. */
const REGION = `  # codeassembly:managed:start\n${BODY}  # codeassembly:managed:end`;

const FOREIGN = "prompts:\n  - name: 'foreign'\n    description: 'h'\n    content_file: foo.md\n";

describe(hasPromptsRegion, () => {
  it('detects a complete sentinel pair', () => {
    expect(hasPromptsRegion(injectPromptsRegion('', BODY))).toBe(true);
  });

  it('returns false for a region-less file', () => {
    expect(hasPromptsRegion(FOREIGN)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(hasPromptsRegion('')).toBe(false);
  });

  it('returns false for an unpaired open marker', () => {
    expect(hasPromptsRegion('prompts:\n  # codeassembly:managed:start\n  - name: x\n')).toBe(false);
  });
});

describe(injectPromptsRegion, () => {
  it('creates prompts: and the region when content is empty', () => {
    expect(injectPromptsRegion('', BODY)).toBe(`prompts:\n${REGION}\n`);
  });

  it('appends the region after foreign prompts: items, preserving them', () => {
    expect(injectPromptsRegion(FOREIGN, BODY)).toBe(`${FOREIGN}${REGION}\n`);
  });

  it('creates a prompts: key after unrelated top-level content', () => {
    expect(injectPromptsRegion('other: value\n', BODY)).toBe(`other: value\nprompts:\n${REGION}\n`);
  });

  it('inserts the region before a top-level key that follows the prompts: block', () => {
    const mixed = `${FOREIGN}other: value\n`;
    expect(injectPromptsRegion(mixed, BODY)).toBe(`${FOREIGN}${REGION}\nother: value\n`);
  });

  it('is byte-identical when re-inserting an identical body', () => {
    const once = injectPromptsRegion('', BODY);
    expect(injectPromptsRegion(once, BODY)).toBe(once);
  });

  it('replaces an existing region in place when the body changes', () => {
    const newBody = "  - name: 'y'\n    description: 'e'\n    content_file: skills/y/SKILL.md\n";
    const newRegion = `  # codeassembly:managed:start\n${newBody}  # codeassembly:managed:end`;

    const updated = injectPromptsRegion(injectPromptsRegion('', BODY), newBody);

    expect(updated).toBe(`prompts:\n${newRegion}\n`);
    expect(updated).not.toContain("name: 'x'");
  });
});

describe(removePromptsRegion, () => {
  it('strips the region while preserving foreign items', () => {
    expect(removePromptsRegion(injectPromptsRegion(FOREIGN, BODY))).toBe(FOREIGN);
  });

  it('collapses an emptied prompts: block to empty content when nothing foreign remains', () => {
    expect(removePromptsRegion(injectPromptsRegion('', BODY))).toBe('');
  });

  it('drops only the prompts: block, keeping unrelated top-level content', () => {
    expect(removePromptsRegion(injectPromptsRegion('other: value\n', BODY))).toBe('other: value\n');
  });

  it('returns content unchanged when no region is present', () => {
    expect(removePromptsRegion(FOREIGN)).toBe(FOREIGN);
    expect(removePromptsRegion('# hand-authored\n')).toBe('# hand-authored\n');
  });
});
