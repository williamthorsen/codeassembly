import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';
import { readFrontmatterList } from '../test-utils/read-frontmatter-list.ts';

// Two routes deliver these rules, and each is asserted where it can be: The ambient route is a `delivery` value on the
// rulebook, checked here, and the hook route is a row in `guidance-hook-reach.unit.test.ts`. Both depend on each rule
// being stated in one file alone, which the last assertion checks. A second statement elsewhere in the corpus is drift
// that separates a rule from its rulebook.
const RULEBOOK = 'guidance/rulebooks/williamthorsen-writing-preferences.md';
const SLUG = 'williamthorsen-writing-preferences';

/** Phrases from each rule that the rulebook states, so that a rule gutted to its heading does not pass. */
const RULE_PHRASES: ReadonlyArray<string> = [
  'A `by`-phrase names the actor in the same breath',
  'A relative clause with an object gap takes an overt relativizer',
  'Capitalize a complete sentence, keep a fragment or list lowercase',
  'Capitalize what follows as though the label were absent',
  'Documentation describes; it does not address',
  'Dropping the pronoun by hiding who acted',
  'If it names the agent that the document instructs',
  'Keep every apostrophe that a possessive or a contraction takes',
  'Join two clauses with `so` only when the second states a direct result of the first',
  'Leave at least three sentences between one clause-joining `so` and the next',
  'Neither a short embedded subject nor a tight word budget exempts anything',
  'Never use title case',
  'never drop or replace the character',
  'Use sentence case',
  'Use `where` for a place, or after an expression to state what a symbol, variable, placeholder, or value in it stands for',
];

describe('writing-preferences reach', () => {
  it('states every rule', async () => {
    const content = await readExpandedRulebook();

    for (const phrase of RULE_PHRASES) {
      expect(content).toContain(phrase);
    }
  });

  it('declares ambient delivery', async () => {
    const delivery = await readFrontmatterList('rulebook', SLUG, 'delivery');

    const message = `${SLUG} drops its ambient route, so an interactive session loses these rules; the hook route delivers them to subagents alone`;
    expect(delivery, message).toContain('ambient');
  });

  it('states each rule in one file alone', async () => {
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

    const message = `Each rule is stated in the rulebook alone; these files restate one instead:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns the rulebook as the pipeline delivers it. */
async function readExpandedRulebook(): Promise<string> {
  return readContentFile(RULEBOOK);
}

// endregion | Helpers
