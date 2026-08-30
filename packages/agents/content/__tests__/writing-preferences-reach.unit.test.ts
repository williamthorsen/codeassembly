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

/** The partial inlined by the rulebook, so a rule stated there reaches the rulebook without being written into it. */
const PARTIAL = '_partials/reduced-object-relative.md';

/** A rule carried by the rulebook: the one file permitted to state it, and phrases that must survive an edit to it. */
interface Rule {
  readonly home: string;
  readonly phrases: ReadonlyArray<string>;
}

// The phrases keep a rule gutted to its heading from passing. The home keys the corpus scan per rule rather than per
// file, so a home is skipped for its own rule's phrases alone and still has to stay clear of every other rule's.
const RULES: ReadonlyArray<Rule> = [
  {
    home: PARTIAL,
    phrases: [
      'A `by`-phrase names the actor in the same breath',
      'A relative clause with an object gap takes an overt relativizer',
      'Neither a short embedded subject nor a tight word budget exempts anything',
    ],
  },
  {
    home: RULEBOOK,
    phrases: [
      'Capitalize a complete sentence, keep a fragment or list lowercase',
      'Capitalize what follows as though the label were absent',
      'Never use title case',
      'Use sentence case',
    ],
  },
];

describe('writing-preferences reach', () => {
  it('states every rule', async () => {
    const content = await readExpandedRulebook();

    for (const { phrases } of RULES) {
      for (const phrase of phrases) {
        expect(content).toContain(phrase);
      }
    }
  });

  it('declares ambient delivery', async () => {
    const { rulebook } = parseRulebookFile(await readRulebook(), SLUG);

    const message = `${SLUG} drops its ambient route, so an interactive session loses these rules; the hook route reaches subagents alone`;
    expect(rulebook.delivery, message).toContain('ambient');
  });

  it('states each rule in one file alone', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      const content = await readFile(file, 'utf8');

      for (const { home, phrases } of RULES) {
        if (relativePath === home) continue;

        for (const phrase of phrases) {
          if (content.includes(phrase)) {
            violations.push(`${relativePath} -> ${phrase}`);
          }
        }
      }
    }

    const message = `Each rule is stated in one file alone, the rulebook or a partial inlined by it; these files restate one instead:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns the rulebook with its includes expanded, so an inlined rule counts as reaching it. */
async function readExpandedRulebook(): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, RULEBOOK), CONTENT_ROOT);
}

/** Returns the rulebook's raw content, frontmatter included. */
async function readRulebook(): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, RULEBOOK), 'utf8');
}

// endregion | Helpers
