import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { parseRulebookFile } from '../../src/lib/rulebook-schema.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Two routes deliver these rules, and each is asserted where it can be: the ambient route is a `delivery` value on the
// rulebook, checked here, and the hook route is a row in `guidance-hook-reach.unit.test.ts`. Both rest on each rule
// having one statement home, which the last assertion checks. A second statement elsewhere in the corpus is the drift
// that separated these rules from their rulebook to begin with.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const RULEBOOK = 'guidance/rulebooks/williamthorsen-writing-preferences.md';
const SLUG = 'williamthorsen-writing-preferences';

/** The partial the rulebook inlines, so a rule it states reaches the rulebook without being written there. */
const PARTIAL = '_partials/reduced-object-relative.md';

/** Phrases that must survive an edit to the rulebook, so a gutted rule cannot still pass on its heading alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  'A `by`-phrase names the actor in the same breath',
  'A relative clause with an object gap takes an overt relativizer',
  'Capitalize a complete sentence, keep a fragment or list lowercase',
  'Capitalize what follows as though the label were absent',
  'Neither a short embedded subject nor a tight word budget exempts anything',
  'Never use title case',
  'Use sentence case',
];

/** The files permitted to state a rule: the rulebook itself, and every partial it inlines a rule from. */
const STATEMENT_HOMES: ReadonlySet<string> = new Set([PARTIAL, RULEBOOK]);

describe('writing-preferences reach', () => {
  it('states every rule', async () => {
    const content = await readExpandedRulebook();

    for (const phrase of RULE_PHRASES) {
      expect(content).toContain(phrase);
    }
  });

  it('declares ambient delivery', async () => {
    const { rulebook } = parseRulebookFile(await readRulebook(), SLUG);

    const message = `${SLUG} drops its ambient route, so an interactive session loses these rules; the hook route reaches subagents alone`;
    expect(rulebook.delivery, message).toContain('ambient');
  });

  it('is stated in no content file but a statement home', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (STATEMENT_HOMES.has(relativePath)) continue;

      const content = await readFile(file, 'utf8');
      for (const phrase of RULE_PHRASES) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }

    const message = `Each rule is stated once, in the rulebook or a partial it inlines; these files restate one instead:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns the rulebook with its includes expanded, so a rule it inlines counts as reaching it. */
async function readExpandedRulebook(): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, RULEBOOK), CONTENT_ROOT);
}

/** Returns the rulebook's raw content, frontmatter included. */
async function readRulebook(): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, RULEBOOK), 'utf8');
}

// endregion | Helpers
