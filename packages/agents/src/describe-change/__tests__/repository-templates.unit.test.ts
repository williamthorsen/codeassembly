import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileTemplate } from '../../change-grammar/compile-template.ts';
import { render } from '../../change-grammar/render.ts';
import type { Taxonomy } from '../../change-grammar/types.ts';
import { verify } from '../../change-grammar/verify.ts';
import { loadTaxonomy } from '../../lib/work-types.ts';
import { loadPreferences } from '../load-preferences.ts';
import { SURFACES } from '../types.ts';

// This repository configures its own title templates, and the engine's semantics decide what they render. A group
// holding both `{scope}` and `{type}` drops the type along with an absent scope, and the `*` scope is absent by the
// time the group decides, so a multi-workspace commit would land with no work type for the changelog to read.

/** The repository root, five levels above this suite. */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The taxonomy the installed helper reads. */
const DATA_DIR = fileURLToPath(new URL('../../../content/skills/_data', import.meta.url));

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

  it('carries the scope through when the change names one', async () => {
    const templates = await loadRepositoryTemplates();

    expect(render(compileTemplate(templates.commit), { scope: 'agents', title: 'Add foo', type: 'feat' })).toBe(
      'agents|feat: Add foo',
    );
  });

  it('round-trips every configured template against the installed taxonomy', async () => {
    const templates = await loadRepositoryTemplates();
    const taxonomy = await readTaxonomy();

    const defects = SURFACES.flatMap((surface) =>
      verify(templates[surface], taxonomy).map((defect) => `${surface}: ${defect}`),
    );

    expect(defects).toEqual([]);
  });
});

// region | Helpers

/** Reads this repository's own templates, with the global tier pointed at an empty directory so it contributes none. */
async function loadRepositoryTemplates(): Promise<Record<(typeof SURFACES)[number], string>> {
  const home = await mkdtemp(join(tmpdir(), 'repository-templates-home-'));
  const { templates } = await loadPreferences({ home, projectRoot: REPO_ROOT });
  return templates;
}

/** Reads the installed taxonomy, failing the test when it does not load. */
async function readTaxonomy(): Promise<Taxonomy> {
  const taxonomy = await loadTaxonomy(DATA_DIR);
  if (taxonomy === null) {
    throw new Error(`expected a readable work-types.json under ${DATA_DIR}`);
  }
  return taxonomy;
}

// endregion | Helpers
