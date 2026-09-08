import { describe, expect, it } from 'vitest';

import { buildVaultIndex } from '../build-vault-index.ts';
import {
  checkVaultIntegrity,
  type ForeignStore,
  type VaultIntegrityNote,
  type VaultIntegrityOptions,
} from '../check-vault-integrity.ts';

describe(checkVaultIntegrity, () => {
  it('returns no findings for an empty vault', () => {
    expect(checkVaultIntegrity([])).toEqual([]);
  });

  it('passes a wikilink that resolves to a vault note', () => {
    const notes = [note('a/Setting up nvm.md'), note('b/Guide.md', 'See [[Setting up nvm]] for details.')];
    expect(checkVaultIntegrity(notes)).toEqual([]);
  });

  it('flags an unresolved wikilink as an error', () => {
    const findings = checkVaultIntegrity([note('a/Guide.md', 'See [[Nonexistent]].')]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('wikilinks.unresolved');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.path).toBe('a/Guide.md');
  });

  it('reports the unresolved link at its file-absolute line', () => {
    const body = ['Line one.', 'Line two with [[Missing]] target.', 'Line three.'].join('\n');
    const findings = checkVaultIntegrity([note('a/Guide.md', body, 5)]);
    // bodyStartLine 5 + one preceding newline = file line 6.
    expect(findings[0]?.line).toBe(6);
  });

  it('reports the line of a link that follows a fenced code block', () => {
    const body = ['Prose.', '```bash', 'if [[ -n "$x" ]]; then :; fi', '```', 'See [[Missing]].'].join('\n');

    const findings = checkVaultIntegrity([note('a/Guide.md', body, 5)]);

    // bodyStartLine 5 + four preceding newlines = file line 9. Masking blanks the fenced line in place and leaves
    // every newline where it was, which is what lets the line count read the unmasked body at a scanned offset.
    expect(findings[0]?.line).toBe(9);
  });

  it('warns once, vault-wide, for a basename shared by two notes even with no referencing link', () => {
    const findings = checkVaultIntegrity([note('engineering/Foo.md'), note('tools/Foo.md')]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('wikilinks.basename');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toContain('engineering/Foo.md');
    expect(findings[0]?.message).toContain('tools/Foo.md');
  });

  it('resolves a link into a collision and does not add a per-link ambiguous finding', () => {
    const notes = [note('engineering/Foo.md'), note('tools/Foo.md'), note('c/Guide.md', 'See [[Foo]] for details.')];
    const findings = checkVaultIntegrity(notes);
    // Only the vault-wide basename warning; the ambiguous link itself is not flagged.
    expect(findings.map((finding) => finding.rule)).toEqual(['wikilinks.basename']);
  });

  it('does not flag wikilink-shaped text inside a fenced code block', () => {
    const body = ['```bash', 'if [[ -n "$x" ]]; then echo hi; fi', '```'].join('\n');
    expect(checkVaultIntegrity([note('a/Guide.md', body)])).toEqual([]);
  });

  it('skips image-extension embeds', () => {
    expect(checkVaultIntegrity([note('a/Guide.md', 'Image: ![[diagram.png]]')])).toEqual([]);
  });

  it('resolves a store-qualified link against the named store', () => {
    const notes = [note('a/Journal.md', 'Stripped from [[fde:Shared assertion]].')];

    expect(checkVaultIntegrity(notes, options({ fde: resolvedStore('content/Shared assertion.md') }))).toEqual([]);
  });

  it('flags a qualified link whose store no registry entry declares', () => {
    const notes = [note('a/Journal.md', 'See [[fed:Shared assertion]].')];

    const findings = checkVaultIntegrity(notes, options({ fed: { status: 'unknown' } }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('wikilinks.unknown-store');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('"fed"');
  });

  it('reports nothing for a store that was never looked up, so a skipped lookup claims nothing about it', () => {
    const notes = [note('a/Journal.md', 'See [[fde:Shared assertion]].')];

    expect(checkVaultIntegrity(notes, options({}))).toEqual([]);
  });

  it('warns rather than errors when the named store could not be read here', () => {
    const notes = [note('a/Journal.md', 'See [[fde:Shared assertion]].')];

    const findings = checkVaultIntegrity(notes, options({ fde: { status: 'unavailable', reason: 'not cloned' } }));

    expect(findings[0]?.rule).toBe('wikilinks.store-unavailable');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toContain('not cloned');
  });

  it('flags a link into a less shareable store, naming both visibilities', () => {
    const notes = [note('a/Assertion.md', 'See [[journal:Secret]].')];

    const findings = checkVaultIntegrity(notes, {
      foreignStores: new Map([['journal', { status: 'disallowed', visibility: 'private' }]]),
      sourceVisibility: 'shared',
    });

    expect(findings[0]?.rule).toBe('wikilinks.disallowed-store');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('a private store');
    expect(findings[0]?.message).toContain('a shared store');
  });

  it('names the store when a qualified link resolves to no note there', () => {
    const notes = [note('a/Journal.md', 'See [[fde:Missing]].')];

    const findings = checkVaultIntegrity(notes, options({ fde: resolvedStore('content/Other.md') }));

    expect(findings[0]?.rule).toBe('wikilinks.unresolved');
    expect(findings[0]?.message).toBe('[[fde:Missing]] does not resolve to any note in the store "fde"');
  });

  it("keeps a qualified target out of this store's basename index", () => {
    const notes = [note('a/Shared assertion.md'), note('b/Journal.md', 'See [[fde:Shared assertion]].')];

    expect(checkVaultIntegrity(notes, options({ fde: resolvedStore('content/Shared assertion.md') }))).toEqual([]);
  });

  it('resolves a qualified link carrying an alias or an anchor', () => {
    const notes = [
      note('a/One.md', 'See [[fde:Shared assertion|the assertion]].'),
      note('a/Two.md', 'See [[fde:Shared assertion#Findings]].'),
    ];

    expect(checkVaultIntegrity(notes, options({ fde: resolvedStore('content/Shared assertion.md') }))).toEqual([]);
  });

  it('treats a qualified target as a bare basename when no options are supplied', () => {
    const findings = checkVaultIntegrity([note('a/Journal.md', 'See [[fde:Shared assertion]].')]);

    expect(findings[0]?.rule).toBe('wikilinks.unresolved');
    expect(findings[0]?.message).toBe('[[fde:Shared assertion]] does not resolve to any vault note');
  });
});

// region | Helpers

function note(path: string, body = '# body', bodyStartLine = 1): VaultIntegrityNote {
  return { path, body, bodyStartLine };
}

/** Builds options for a private source store over a `name -> outcome` map of the stores its links name. */
function options(foreignStores: Record<string, ForeignStore>): VaultIntegrityOptions {
  return { foreignStores: new Map(Object.entries(foreignStores)), sourceVisibility: 'private' };
}

/** Builds a resolved store whose index carries the given note paths. */
function resolvedStore(...paths: string[]): ForeignStore {
  return { status: 'resolved', index: buildVaultIndex(paths.map((path) => ({ path }))) };
}

// endregion | Helpers
