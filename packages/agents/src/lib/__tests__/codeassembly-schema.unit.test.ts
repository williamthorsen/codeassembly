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
    expect(parseCodeAssemblyFile('')).toEqual({ root: false, sources: [] });
    expect(parseCodeAssemblyFile('# just a comment\n')).toEqual({ root: false, sources: [] });
  });

  it('tolerates unknown keys on a structured entry', () => {
    const declaration = parseCodeAssemblyFile(
      'rulebooks:\n  use:\n    - name: alpha\n      source: npm\n      delivery: skill\n',
    );

    expect(declaration.rulebooks?.use[0]).toMatchObject({ name: 'alpha', source: 'npm', delivery: 'skill' });
  });

  it('parses the other type keys without interpreting them', () => {
    const declaration = parseCodeAssemblyFile(
      'skills:\n  use:\n    - alpha\nsubagents:\n  use:\n    - beta\ncollections:\n  use:\n    - gamma\n',
    );

    expect(declaration.skills?.use).toEqual([{ name: 'alpha' }]);
    expect(declaration.subagents?.use).toEqual([{ name: 'beta' }]);
    expect(declaration.collections?.use).toEqual([{ name: 'gamma' }]);
  });

  it('parses a packages declaration of scoped and unscoped names', () => {
    const declaration = parseCodeAssemblyFile(
      "packages:\n  use:\n    - '@williamthorsen/nmr'\n    - readyup\n  drop:\n    - '@acme/legacy'\n",
    );

    expect(declaration.packages?.use).toEqual([{ name: '@williamthorsen/nmr' }, { name: 'readyup' }]);
    expect(declaration.packages?.drop).toEqual([{ name: '@acme/legacy' }]);
  });

  it('tolerates a packages key whose value is null (all entries commented out)', () => {
    const declaration = parseCodeAssemblyFile('packages:\n');

    expect(declaration.packages).toBeUndefined();
    expect(declaration.root).toBe(false);
  });

  it('throws on an unknown key inside the packages block', () => {
    expect(() => parseCodeAssemblyFile('packages:\n  install:\n    - alpha\n')).toThrow(/install/);
  });

  it('throws on an unknown top-level key (typo protection)', () => {
    expect(() => parseCodeAssemblyFile('rulebookz:\n  use:\n    - alpha\n')).toThrow(/rulebookz/);
  });

  it('reads home-writer from a home-domain file', () => {
    const declaration = parseCodeAssemblyFile('home-writer: /repos/live\n', 'codeassembly.yaml', 'home');

    expect(declaration['home-writer']).toBe('/repos/live');
  });

  it('throws on home-writer in a project-domain file, naming the file and where the key belongs', () => {
    const parse = () => parseCodeAssemblyFile('home-writer: /repos/live\n', '.agents/codeassembly.yaml', 'project');

    expect(parse).toThrow(/home-writer/);
    expect(parse).toThrow(/~\/\.agents\/codeassembly\.yaml/);
    expect(parse).toThrow(/in \.agents\/codeassembly\.yaml/);
  });

  it('throws on home-writer when the domain is unstated, so an unread key cannot pass unnoticed', () => {
    expect(() => parseCodeAssemblyFile('home-writer: /repos/live\n')).toThrow(/home-writer/);
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

  it('tolerates a type key whose value is null (all entries commented out)', () => {
    const declaration = parseCodeAssemblyFile('rulebooks:\n');

    expect(declaration.rulebooks).toBeUndefined();
    expect(declaration.root).toBe(false);
  });

  it('defaults sources to an empty list when the key is absent', () => {
    const declaration = parseCodeAssemblyFile('rulebooks:\n  use:\n    - alpha\n');

    expect(declaration.sources).toEqual([]);
  });

  it('tolerates a sources key whose value is null (all entries commented out)', () => {
    const declaration = parseCodeAssemblyFile('sources:\n');

    expect(declaration.sources).toEqual([]);
    expect(declaration.root).toBe(false);
  });

  it('parses a sources list of name/path pairs', () => {
    const declaration = parseCodeAssemblyFile(
      'sources:\n  - name: org\n    path: ../shared-guidance\n  - name: home\n    path: ~/guidance\n',
    );

    expect(declaration.sources).toEqual([
      { name: 'org', path: '../shared-guidance' },
      { name: 'home', path: '~/guidance' },
    ]);
  });

  it('tolerates unknown keys on a source entry', () => {
    const declaration = parseCodeAssemblyFile('sources:\n  - name: org\n    path: ../shared\n    ref: v2\n');

    expect(declaration.sources[0]).toMatchObject({ name: 'org', path: '../shared', ref: 'v2' });
  });

  it('throws when a source is missing name', () => {
    expect(() => parseCodeAssemblyFile('sources:\n  - path: ../shared\n')).toThrow(/name/);
  });

  it('throws when a source is missing path', () => {
    expect(() => parseCodeAssemblyFile('sources:\n  - name: org\n')).toThrow(/path/);
  });

  it('throws when a source path is an empty string', () => {
    expect(() => parseCodeAssemblyFile('sources:\n  - name: org\n    path: ""\n')).toThrow(/path/);
  });

  it('throws when a source name is an empty string', () => {
    expect(() => parseCodeAssemblyFile('sources:\n  - name: ""\n    path: ../shared\n')).toThrow(/name/);
  });

  it('throws when sources is not a list', () => {
    expect(() => parseCodeAssemblyFile('sources:\n  name: org\n  path: ../shared\n')).toThrow();
  });

  it('parses a harnesses declaration with bare and structured entries', () => {
    const declaration = parseCodeAssemblyFile('harnesses:\n  use:\n    - claude\n    - name: rovo\n');

    expect(declaration.harnesses?.use).toEqual([{ name: 'claude' }, { name: 'rovo' }]);
    expect(declaration.harnesses?.drop).toEqual([]);
  });

  it('parses a harnesses drop list alongside use', () => {
    const declaration = parseCodeAssemblyFile('harnesses:\n  use:\n    - claude\n  drop:\n    - rovo\n');

    expect(declaration.harnesses?.use).toEqual([{ name: 'claude' }]);
    expect(declaration.harnesses?.drop).toEqual([{ name: 'rovo' }]);
  });

  it('tolerates a harnesses key whose value is null (all entries commented out)', () => {
    const declaration = parseCodeAssemblyFile('harnesses:\n');

    expect(declaration.harnesses).toBeUndefined();
    expect(declaration.root).toBe(false);
  });

  it('throws on an unknown harness id, naming the source label and the offending entry', () => {
    expect(() => parseCodeAssemblyFile('harnesses:\n  use:\n    - claud\n', 'codeassembly.yaml')).toThrow(
      /codeassembly\.yaml.*harnesses\.use\.0/s,
    );
  });

  it('throws on an unknown harness id in the drop list', () => {
    expect(() => parseCodeAssemblyFile('harnesses:\n  drop:\n    - cursor\n')).toThrow(/harnesses\.drop\.0/);
  });

  it('throws on an unknown key inside the harnesses block', () => {
    expect(() => parseCodeAssemblyFile('harnesses:\n  target:\n    - claude\n')).toThrow(/target/);
  });

  it('parses a guidance-hooks block, giving each hook its own use and drop lists', () => {
    const declaration = parseCodeAssemblyFile(
      [
        'guidance-hooks:',
        '  implementation-preferences:',
        '    use:',
        '      - layout-preferences',
        '      - typescript-preferences',
        '    drop:',
        '      - legacy-preferences',
        '  project-glossary:',
        '    use:',
        '      - acme-terms',
        '',
      ].join('\n'),
    );

    expect(declaration['guidance-hooks']).toEqual({
      'implementation-preferences': {
        use: [{ name: 'layout-preferences' }, { name: 'typescript-preferences' }],
        drop: [{ name: 'legacy-preferences' }],
      },
      'project-glossary': { use: [{ name: 'acme-terms' }], drop: [] },
    });
  });

  it('tolerates a guidance-hooks key whose value is null (all bindings commented out)', () => {
    const declaration = parseCodeAssemblyFile('guidance-hooks:\n');

    expect(declaration['guidance-hooks']).toBeUndefined();
    expect(declaration.root).toBe(false);
  });

  it('throws on a malformed guidance-hook name, naming the source label and the offending key', () => {
    expect(() =>
      parseCodeAssemblyFile(
        'guidance-hooks:\n  Implementation_Preferences:\n    use:\n      - alpha\n',
        'codeassembly.yaml',
      ),
    ).toThrow(/codeassembly\.yaml.*Implementation_Preferences/s);
  });

  it('throws on an unknown key inside a guidance hook block', () => {
    expect(() => parseCodeAssemblyFile('guidance-hooks:\n  impl:\n    bind:\n      - alpha\n')).toThrow(/bind/);
  });
});
