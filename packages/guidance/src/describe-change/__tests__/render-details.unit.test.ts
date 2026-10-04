import { describe, expect, it } from 'vitest';

import embeddedTaxonomy from '../../../content/skills/_data/work-types.json' with { type: 'json' };
import type { Taxonomy } from '../../change-grammar/types.ts';
import { loadTaxonomy, loadWorkTypeHeadings, type WorkTypeHeadings } from '../../lib/work-types.ts';
import type { ChangeEntry } from '../change-entries.ts';
import { renderDetails } from '../render-details.ts';

const TAXONOMY = await requireTaxonomy();
const HEADINGS = await requireHeadings();

describe(renderDetails, () => {
  it.each(embeddedTaxonomy.types)('heads a $key entry with `$emoji $label`', ({ emoji, key, label }) => {
    const details = renderDetails([buildEntry({ type: key })], TAXONOMY, HEADINGS);

    expect(details).toBe(`### ${emoji} ${label}\n\n- Does the thing`);
  });

  it('orders subsections by tier, then by listing order, whatever order the entries arrive in', () => {
    const entries = [
      buildEntry({ text: 'Bumps a dependency', type: 'deps' }),
      buildEntry({ text: 'Restructures a module', type: 'refactor' }),
      buildEntry({ text: 'Fixes a crash', type: 'fix' }),
      buildEntry({ text: 'Adds a flag', type: 'feat' }),
    ];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe(
      [
        '### 🎉 Features',
        '',
        '- Adds a flag',
        '',
        '### 🐛 Bug fixes',
        '',
        '- Fixes a crash',
        '',
        '### ♻️ Refactoring',
        '',
        '- Restructures a module',
        '',
        '### 📦 Dependencies',
        '',
        '- Bumps a dependency',
      ].join('\n'),
    );
  });

  it('keeps the entries of one type in the order given', () => {
    const entries = [buildEntry({ text: 'Second' }), buildEntry({ text: 'First' })];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- Second\n- First');
  });

  it('opens a breaking entry with the breaking prefix', () => {
    const details = renderDetails([buildEntry({ breaking: true, text: 'Drops the flag' })], TAXONOMY, HEADINGS);

    expect(details).toBe('### 🎉 Features\n\n- 🚨 **Breaking:** Drops the flag');
  });

  it('nests a migration 4 spaces under its bullet, leaving the tags on the bullet', () => {
    const entries = [
      buildEntry({ breaking: true, migration: 'Pass `--new`.', scopes: ['agents'], text: 'Renames the flag.' }),
      buildEntry({ scopes: ['kb'], text: 'Adds a note.' }),
    ];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe(
      [
        '### 🎉 Features',
        '',
        '- 🚨 **Breaking:** Renames the flag. #agents',
        '    - Migration: Pass `--new`.',
        '- Adds a note. #kb',
      ].join('\n'),
    );
  });

  it('tags each bullet with its scopes when the scope sets differ', () => {
    const entries = [
      buildEntry({ scopes: ['agents', 'kb'], text: 'One' }),
      buildEntry({ scopes: ['kb'], text: 'Two' }),
    ];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- One #agents, #kb\n- Two #kb');
  });

  it('leaves the bullets untagged when every entry names the same scopes', () => {
    const entries = [buildEntry({ scopes: ['kb'], text: 'One' }), buildEntry({ scopes: ['kb'], text: 'Two' })];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- One\n- Two');
  });

  it('treats scope lists that differ only in order or repetition as the same set', () => {
    const entries = [
      buildEntry({ scopes: ['agents', 'kb'], text: 'One' }),
      buildEntry({ scopes: ['kb', 'agents', 'kb'], text: 'Two' }),
    ];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- One\n- Two');
  });

  it('leaves an entry without scopes untagged when the others are tagged, and tags each scope once', () => {
    const entries = [buildEntry({ scopes: ['kb', 'kb'], text: 'One' }), buildEntry({ scopes: [], text: 'Two' })];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- One #kb\n- Two');
  });

  it('places an entry typed by an alias under its canonical type', () => {
    const alias = TAXONOMY.types.find((workType) => workType.key === 'feat')?.aliases?.[0];
    if (alias === undefined) {
      throw new Error('expected `feat` to declare an alias');
    }
    const entries = [buildEntry({ text: 'One' }), buildEntry({ text: 'Two', type: alias })];

    expect(renderDetails(entries, TAXONOMY, HEADINGS)).toBe('### 🎉 Features\n\n- One\n- Two');
  });

  it.each(['invented', 'feat!'])('refuses an entry typed %s, which the taxonomy does not declare', (type) => {
    expect(() => renderDetails([buildEntry(), buildEntry({ type })], TAXONOMY, HEADINGS)).toThrow(
      `\`entries[1].type\` names ${type}, which the taxonomy does not declare`,
    );
  });

  it('refuses a `text` that spans more than one line', () => {
    expect(() => renderDetails([buildEntry({ text: 'One\nTwo' })], TAXONOMY, HEADINGS)).toThrow(
      '`entries[0].text` spans more than one line',
    );
  });

  it('renders an empty body for an empty list', () => {
    expect(renderDetails([], TAXONOMY, HEADINGS)).toBe('');
  });
});

// region | Helpers

/** Builds a non-breaking `feat` entry without scopes, overriding the given fields. */
function buildEntry(overrides: Partial<ChangeEntry> = {}): ChangeEntry {
  return { breaking: false, scopes: [], text: 'Does the thing', type: 'feat', ...overrides };
}

/** Loads the embedded taxonomy's headings, failing the suite when they do not load. */
async function requireHeadings(): Promise<WorkTypeHeadings> {
  const headings = await loadWorkTypeHeadings();
  if (headings === null) {
    throw new Error('expected the embedded taxonomy to declare every heading');
  }
  return headings;
}

/** Loads the embedded taxonomy, failing the suite when it does not load. */
async function requireTaxonomy(): Promise<Taxonomy> {
  const taxonomy = await loadTaxonomy();
  if (taxonomy === null) {
    throw new Error('expected the embedded taxonomy to load');
  }
  return taxonomy;
}

// endregion | Helpers
