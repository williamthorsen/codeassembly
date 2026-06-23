import { describe, expect, it } from 'vitest';

import { parseCodeAssemblyFile } from '../codeassembly-schema.ts';

describe(parseCodeAssemblyFile, () => {
  it('parses a grouped rulebooks declaration with bare and structured entries', () => {
    const declaration = parseCodeAssemblyFile('rulebooks:\n  use:\n    - shell-conventions\n    - name: typescript\n');

    expect(declaration.root).toBe(false);
    expect(declaration.rulebooks?.use).toEqual([{ name: 'shell-conventions' }, { name: 'typescript' }]);
    expect(declaration.rulebooks?.drop).toEqual([]);
  });

  it('parses a drop list alongside use', () => {
    const declaration = parseCodeAssemblyFile('rulebooks:\n  use:\n    - alpha\n  drop:\n    - beta\n');

    expect(declaration.rulebooks?.use).toEqual([{ name: 'alpha' }]);
    expect(declaration.rulebooks?.drop).toEqual([{ name: 'beta' }]);
  });

  it('parses root: true', () => {
    const declaration = parseCodeAssemblyFile('root: true\nrulebooks:\n  use:\n    - alpha\n');

    expect(declaration.root).toBe(true);
  });

  it('treats an empty or comment-only file as nothing declared', () => {
    expect(parseCodeAssemblyFile('')).toEqual({ root: false });
    expect(parseCodeAssemblyFile('# just a comment\n')).toEqual({ root: false });
  });

  it('tolerates unknown keys on a structured entry (reserved seam)', () => {
    const declaration = parseCodeAssemblyFile(
      'rulebooks:\n  use:\n    - name: alpha\n      source: npm\n      delivery: skill\n',
    );

    expect(declaration.rulebooks?.use[0]).toMatchObject({ name: 'alpha', source: 'npm', delivery: 'skill' });
  });

  it('parses the other category keys without interpreting them', () => {
    const declaration = parseCodeAssemblyFile(
      'skills:\n  use:\n    - alpha\nsubagents:\n  use:\n    - beta\ncollections:\n  use:\n    - gamma\n',
    );

    expect(declaration.skills?.use).toEqual([{ name: 'alpha' }]);
    expect(declaration.subagents?.use).toEqual([{ name: 'beta' }]);
    expect(declaration.collections?.use).toEqual([{ name: 'gamma' }]);
  });

  it('throws on an unknown top-level key (typo protection)', () => {
    expect(() => parseCodeAssemblyFile('rulebookz:\n  use:\n    - alpha\n')).toThrow(/rulebookz/);
  });

  it('throws when the top level is a bare list instead of a mapping', () => {
    expect(() => parseCodeAssemblyFile('- alpha\n- beta\n')).toThrow();
  });

  it('throws when an entry is neither a string nor has a name', () => {
    expect(() => parseCodeAssemblyFile('rulebooks:\n  use:\n    - 42\n')).toThrow();
  });

  it('names the source label in the error message when provided', () => {
    expect(() => parseCodeAssemblyFile('rulebookz: {}\n', 'codeassembly.yaml')).toThrow(/codeassembly\.yaml/);
  });

  it('throws on malformed YAML, naming the source label', () => {
    expect(() => parseCodeAssemblyFile('rulebooks:\n  use: [\n', 'codeassembly.local.yaml')).toThrow(
      /codeassembly\.local\.yaml/,
    );
  });

  it('tolerates a category key whose value is null (all entries commented out)', () => {
    const declaration = parseCodeAssemblyFile('rulebooks:\n');

    expect(declaration.rulebooks).toBeUndefined();
    expect(declaration.root).toBe(false);
  });
});
