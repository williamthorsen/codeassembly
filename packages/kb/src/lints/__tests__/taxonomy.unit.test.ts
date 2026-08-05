import { describe, expect, it } from 'vitest';

import { defaultKbConfig, type KbConfig } from '../../config/config-schema.ts';
import { ASSERTIONS_DIR, EVENTS_DIR } from '../../layout/index.ts';
import type { Taxonomy } from '../../taxonomy/taxonomy-schema.ts';
import { taxonomyFindings, type TaxonomyNote } from '../taxonomy.ts';

const TAXONOMY_PATH = '/store/.kb/taxonomy.yaml';

describe(taxonomyFindings, () => {
  it('reports nothing when the taxonomy declares no domains', () => {
    const findings = run({ notes: ['engineering/note.md'], declared: [] });

    expect(findings).toEqual([]);
  });

  it('reports nothing when every folder holding notes is declared', () => {
    const findings = run({
      notes: ['engineering/note.md', 'engineering/tooling/note.md'],
      declared: ['engineering', 'engineering/tooling'],
    });

    expect(findings).toEqual([]);
  });

  it('reports a folder holding notes that no domain declares', () => {
    const findings = run({ notes: ['engineering/note.md'], declared: ['languages'] });

    expect(rulesIn(findings)).toContain('taxonomy.undeclared');
    expect(messageFor(findings, 'taxonomy.undeclared')).toContain('"engineering"');
  });

  it('reports a declared domain that holds no notes', () => {
    const findings = run({ notes: ['engineering/note.md'], declared: ['engineering', 'languages'] });

    expect(messageFor(findings, 'taxonomy.unused')).toContain('"languages"');
  });

  it('does not report a grouping domain whose descendants hold notes', () => {
    const findings = run({
      notes: ['engineering/tooling/versioning/note.md'],
      declared: ['engineering', 'engineering/tooling', 'engineering/tooling/versioning'],
    });

    expect(findings).toEqual([]);
  });

  it('reports a declared domain whose parent is undeclared', () => {
    const findings = run({ notes: ['engineering/tooling/note.md'], declared: ['engineering/tooling'] });

    expect(messageFor(findings, 'taxonomy.orphan')).toBe(
      'domain "engineering/tooling" is declared but its parent "engineering" is not',
    );
  });

  it('does not report a top-level domain as an orphan', () => {
    const findings = run({ notes: ['engineering/note.md'], declared: ['engineering'] });

    expect(rulesIn(findings)).not.toContain('taxonomy.orphan');
  });

  it('ignores event records when deriving observed domains', () => {
    const findings = taxonomyFindings({
      notes: [{ relativePath: `${EVENTS_DIR}/01JABC.md` }, { relativePath: `${ASSERTIONS_DIR}/engineering/note.md` }],
      taxonomy: buildTaxonomy(['engineering']),
      config: defaultKbConfig,
      taxonomyPath: TAXONOMY_PATH,
    });

    expect(findings).toEqual([]);
  });

  it('ignores a note sitting directly in the assertions root', () => {
    const findings = run({ notes: ['Loose.md'], declared: ['engineering'], extraNotes: ['engineering/note.md'] });

    expect(findings).toEqual([]);
  });

  it('does not report a declared domain inside an excluded subtree as unused', () => {
    const config: KbConfig = { ...defaultKbConfig, exclude: [`${ASSERTIONS_DIR}/drafts/**`] };

    const findings = taxonomyFindings({
      notes: [{ relativePath: `${ASSERTIONS_DIR}/engineering/note.md` }],
      taxonomy: buildTaxonomy(['engineering', 'drafts']),
      config,
      taxonomyPath: TAXONOMY_PATH,
    });

    expect(findings).toEqual([]);
  });

  it('reports every finding against the taxonomy file, vault-scoped and as a warning', () => {
    const findings = run({ notes: ['engineering/note.md'], declared: ['languages/rust'] });

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding).toMatchObject({ path: TAXONOMY_PATH, scope: 'vault', severity: 'warning' });
      expect(finding.line).toBeUndefined();
    }
  });

  it('orders each rule by domain, so the report is stable across runs', () => {
    const findings = run({
      notes: ['tools/note.md', 'engineering/note.md', 'languages/note.md'],
      declared: ['other'],
    });

    expect(
      findings.filter((finding) => finding.rule === 'taxonomy.undeclared').map((finding) => finding.message),
    ).toEqual([
      'folder "engineering" holds notes but no domain declares it',
      'folder "languages" holds notes but no domain declares it',
      'folder "tools" holds notes but no domain declares it',
    ]);
  });
});

// region | Helpers

/** Builds a taxonomy declaring each path under `domains:` with no description. */
function buildTaxonomy(paths: readonly string[]): Taxonomy {
  return new Map(paths.map((path) => [path, { description: '', provisional: false }]));
}

/** Reads the message of the single finding carrying `rule`. */
function messageFor(findings: readonly { rule: string; message: string }[], rule: string): string | undefined {
  return findings.find((finding) => finding.rule === rule)?.message;
}

/** Runs the rules over assertions-root-relative note paths and declared domains. */
function run(input: { notes: readonly string[]; declared: readonly string[]; extraNotes?: readonly string[] }) {
  const paths = [...input.notes, ...(input.extraNotes ?? [])];
  const notes: TaxonomyNote[] = paths.map((path) => ({ relativePath: `${ASSERTIONS_DIR}/${path}` }));
  return taxonomyFindings({
    notes,
    taxonomy: buildTaxonomy(input.declared),
    config: defaultKbConfig,
    taxonomyPath: TAXONOMY_PATH,
  });
}

/** Lists the rule codes present in a finding set. */
function rulesIn(findings: readonly { rule: string }[]): string[] {
  return findings.map((finding) => finding.rule);
}

// endregion | Helpers
