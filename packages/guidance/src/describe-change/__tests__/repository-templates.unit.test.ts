import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileTemplate, render, type Taxonomy, verify } from '@williamthorsen/change-grammar';
import { describe, expect, it } from 'vitest';

import { loadPreferences } from '../load-preferences.ts';
import { SURFACES } from '../types.ts';

// This repository configures its own title templates, and the engine's semantics decide what they render. A group
// containing both `{scope}` and `{type}` drops the type along with an absent scope, and the `*` scope is absent by the
// time the group decides, so a multi-workspace commit would not name any work type for the changelog to read.

/** The repository root, five levels above this suite. */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** A taxonomy declaring one type of each breaking policy, independent of the library's own. */
const TAXONOMY: Taxonomy = {
  tiers: ['public', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

describe('this repository’s title templates', () => {
  it('names a template for every surface', async () => {
    const templates = await loadRepositoryTemplates();

    expect(SURFACES.filter((surface) => templates[surface] === '')).toEqual([]);
  });

  it('renders a work type for a wildcard-scoped change on every surface naming {type}', async () => {
    const templates = await loadRepositoryTemplates();
    const record = { prNumber: '1650', scope: '*', ticketRef: '#1642', title: 'Sweep prose', type: 'docs' };

    const rendered = SURFACES.filter((surface) => templates[surface].includes('{type}')).map((surface) => [
      surface,
      render(compileTemplate(templates[surface]), record),
    ]);

    expect(rendered).toEqual([
      ['commit', 'docs: Sweep prose'],
      ['merge', '#1642 docs: Sweep prose (#1650)'],
    ]);
  });

  it('renders the scope when the change names one', async () => {
    const templates = await loadRepositoryTemplates();

    expect(render(compileTemplate(templates.commit), { scope: 'agents', title: 'Add foo', type: 'feat' })).toBe(
      'agents|feat: Add foo',
    );
  });

  it('round-trips every configured template', async () => {
    const templates = await loadRepositoryTemplates();

    const defects = SURFACES.flatMap((surface) =>
      verify(templates[surface], TAXONOMY).map((defect) => `${surface}: ${defect}`),
    );

    expect(defects).toEqual([]);
  });
});

// region | Helpers

/**
 * Reads this repository's own templates, with the global tier pointed at an empty directory so that it contributes
 * none.
 */
async function loadRepositoryTemplates(): Promise<Record<(typeof SURFACES)[number], string>> {
  const home = await mkdtemp(join(tmpdir(), 'repository-templates-home-'));
  const { templates } = await loadPreferences({ home, projectRoot: REPO_ROOT });
  return templates;
}

// endregion | Helpers
