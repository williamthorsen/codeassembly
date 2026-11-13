import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { GLOBAL_DECLARATION_TEMPLATE, PROJECT_DECLARATION_TEMPLATE } from '../../commands/init.ts';
import { parseCodeAssemblyFile } from '../codeassembly-schema.ts';
import { buildDeclarationSchema, buildDeclarationSchemaUrl } from '../declaration-json-schema.ts';

const ACCEPTED_DECLARATIONS: Record<string, string> = {
  'an empty file': '',
  'bare and structured entries with use and drop': [
    'rulebooks:',
    '  use:',
    '    - alpha',
    '    - name: beta',
    '      delivery: skill',
    '  drop:',
    '    - gamma',
  ].join('\n'),
  'every type block': [
    'packages:\n  use:\n    - "@scope/pkg"',
    'skills:\n  use:\n    - a',
    'subagents:\n  drop:\n    - b',
    'collections:\n  use:\n    - recommended',
  ].join('\n'),
  'root and home-writer': 'root: true\nhome-writer: /Users/someone/repos/configs\n',
  'harnesses with bare and structured ids': 'harnesses:\n  use:\n    - claude\n  drop:\n    - name: rovo\n',
  'a path source and a package source': [
    'sources:',
    '  - name: local',
    '    path: ../content',
    '  - package: codeassembly-guidance',
    '  - package: other-guidance',
    '    name: other',
  ].join('\n'),
  'references with and without resolve-from': [
    'references:',
    '  - name: nmr-docs',
    '    package: "@williamthorsen/nmr"',
    '    path: docs',
    '    summary: How nmr runs commands.',
    '  - name: other-docs',
    '    package: other',
    '    path: docs/index.md',
    '    summary: Other docs.',
    '    resolve-from: packages/app',
  ].join('\n'),
  'guidance-hook bindings': 'guidance-hooks:\n  implementation-preferences:\n    use:\n      - typescript\n',
  'blocks whose value is null': [
    'harnesses:',
    'sources:',
    'references:',
    'packages:',
    'rulebooks:',
    'skills:',
    'subagents:',
    'collections:',
    'guidance-hooks:',
  ].join('\n'),
  'this repository declaration': readFileSync(
    path.resolve(import.meta.dirname, '../../../../../.agents/codeassembly.yaml'),
    'utf8',
  ),
  'the project init template': PROJECT_DECLARATION_TEMPLATE,
  'the global init template': GLOBAL_DECLARATION_TEMPLATE,
};

const REJECTED_DECLARATIONS: Record<string, string> = {
  'an unknown top-level key': 'rulebook:\n  use:\n    - alpha\n',
  'an unknown key inside a type block': 'skills:\n  include:\n    - alpha\n',
  'an unknown harness id': 'harnesses:\n  use:\n    - cursor\n',
  'an unknown harness id in a structured entry': 'harnesses:\n  drop:\n    - name: claud\n',
};

describe(buildDeclarationSchema, () => {
  const validate = new Ajv2020({ strict: false }).compile(buildDeclarationSchema('1.2.3'));

  it.each(Object.entries(ACCEPTED_DECLARATIONS))('accepts %s, as the parser does', (_label, raw) => {
    expect(() => parseCodeAssemblyFile(raw, undefined, 'home')).not.toThrow();
    expect(validate(parseYaml(raw) ?? {}), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(Object.entries(REJECTED_DECLARATIONS))('rejects %s, as the parser does', (_label, raw) => {
    expect(() => parseCodeAssemblyFile(raw)).toThrow();
    expect(validate(parseYaml(raw))).toBe(false);
  });

  it('stamps the $id of the release', () => {
    expect(buildDeclarationSchema('1.2.3')).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://unpkg.com/codeassembly@1.2.3/schemas/codeassembly.v1.json',
    });
  });
});

describe(buildDeclarationSchemaUrl, () => {
  it('names the schema file in the npm release at the version', () => {
    expect(buildDeclarationSchemaUrl('0.21.0')).toBe(
      'https://unpkg.com/codeassembly@0.21.0/schemas/codeassembly.v1.json',
    );
  });
});
