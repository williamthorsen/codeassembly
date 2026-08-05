import { describe, expect, it } from 'vitest';

import { checkVaultIntegrity, type VaultIntegrityNote } from '../check-vault-integrity.ts';

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
});

// region | Helpers

function note(path: string, body = '# body', bodyStartLine = 1): VaultIntegrityNote {
  return { path, body, bodyStartLine };
}

// endregion | Helpers
