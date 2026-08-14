import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRulebookFile } from '../../src/lib/rulebook-schema.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Two routes carry these rules, and each is asserted where it can be: the ambient route is a `delivery` value on the
// rulebook, checked here, and the hook route is a row in `guidance-hook-reach.unit.test.ts`. Both rest on the rulebook
// being the only place the rules are stated, which the last assertion holds. A second statement elsewhere in the
// corpus is the drift that stranded these rules from their rulebook to begin with.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const RULEBOOK = 'guidance/rulebooks/williamthorsen-writing-preferences.md';
const SLUG = 'williamthorsen-writing-preferences';

/** Phrases that must survive an edit to the rulebook, so a gutted rule cannot still pass on its heading alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  'Capitalize a complete sentence, keep a fragment or list lowercase',
  'Capitalize what follows as though the label were absent',
  'Never use title case',
  'Use sentence case',
];

describe('writing-preferences reach', () => {
  it('states every rule', async () => {
    const content = await readRulebook();

    for (const phrase of RULE_PHRASES) {
      expect(content).toContain(phrase);
    }
  });

  it('declares ambient delivery', async () => {
    const { rulebook } = parseRulebookFile(await readRulebook(), SLUG);

    const message = `${SLUG} drops its ambient route, so an interactive session loses the rules the hook only reaches subagents with`;
    expect(rulebook.delivery, message).toContain('ambient');
  });

  it('is stated in no content file but the rulebook', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === RULEBOOK) continue;

      const content = await readFile(file, 'utf8');
      for (const phrase of RULE_PHRASES) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }

    const message = `The rules are stated once, in the rulebook; these files restate them instead:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns the rulebook's raw content, frontmatter included. */
async function readRulebook(): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, RULEBOOK), 'utf8');
}

// endregion | Helpers
