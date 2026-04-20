import { describe, expect, it } from 'vitest';

import { isFoldable, transformFile } from '../replace-separator-comments.js';

describe(isFoldable, () => {
  const foldable = [
    'Helpers',
    'helpers',
    'Test helpers',
    'Helper functions',
    'Sub-function A',
    'sub-function: orchestrator state',
    'Type guards',
    'type guard',
    'Types',
    'Diff types',
    'Styles',
    'Style definitions',
    'Getters',
    'getter',
  ];
  const notFoldable = [
    'Typescript config',
    'Stylesheet loader',
    'Canvas dimensions',
    'Zone Y positions',
    '1. Empty run',
    'Constants',
    'mapRunToLogicalScene',
  ];

  it.each(foldable)('matches %s', (label) => {
    expect(isFoldable(label)).toBe(true);
  });

  it.each(notFoldable)('does not match %s', (label) => {
    expect(isFoldable(label)).toBe(false);
  });
});

describe(transformFile, () => {
  it('rewrites 3-line dash box to inline heading', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Canvas dimensions',
      '// ---------------------------------------------------------------------------',
      '',
      'export const W = 800;',
    ].join('\n');
    const output = transformFile(input);
    expect(output).toContain('// -- Canvas dimensions --');
    expect(output).not.toContain('// ---------------------------------------------------------------------------');
  });

  it('rewrites 3-line equals box to inline heading', () => {
    const input = [
      '// ================================================================',
      '// Section',
      '// ================================================================',
      '',
      'const x = 1;',
    ].join('\n');
    const output = transformFile(input);
    expect(output).toContain('// -- Section --');
    expect(output).not.toMatch(/={8,}/);
  });

  it('rewrites single-line symmetric to inline heading', () => {
    const input = '// --- Agent state opacities ---\nconst x = 1;';
    const output = transformFile(input);
    expect(output).toBe('// -- Agent state opacities --\nconst x = 1;');
  });

  it('rewrites single-line asymmetric rulered to inline heading', () => {
    const input = '// -- fixtures ----------------------------------------------------------------\nconst x = 1;';
    const output = transformFile(input);
    expect(output).toBe('// -- fixtures --\nconst x = 1;');
  });

  it('converts foldable label to region + endregion at EOF', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Helpers',
      '// ---------------------------------------------------------------------------',
      '',
      'function foo() {}',
      'function bar() {}',
    ].join('\n');
    const output = transformFile(input);
    const expected = [
      '// region | Helpers',
      '',
      'function foo() {}',
      'function bar() {}',
      '',
      '// endregion | Helpers',
    ].join('\n');
    expect(output).toBe(expected);
  });

  it('terminates region at next same-indent separator', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Helpers',
      '// ---------------------------------------------------------------------------',
      '',
      'function foo() {}',
      '',
      '// ---------------------------------------------------------------------------',
      '// Main',
      '// ---------------------------------------------------------------------------',
      '',
      'export const MAIN = 1;',
    ].join('\n');
    const output = transformFile(input);
    expect(output).toContain('// region | Helpers');
    expect(output).toContain('// endregion | Helpers');
    expect(output).toContain('// -- Main --');
    const endRegionIdx = output.indexOf('// endregion | Helpers');
    const mainIdx = output.indexOf('// -- Main --');
    expect(endRegionIdx).toBeLessThan(mainIdx);
    expect(output.indexOf('function foo()')).toBeLessThan(endRegionIdx);
  });

  it('treats nested indented separators independently', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Outer',
      '// ---------------------------------------------------------------------------',
      '',
      'describe("outer", () => {',
      '  // -------------------------------------------------------------------------',
      '  // 1. Inner case',
      '  // -------------------------------------------------------------------------',
      '  it("works", () => {});',
      '});',
    ].join('\n');
    const output = transformFile(input);
    expect(output).toContain('// -- Outer --');
    expect(output).toContain('  // -- 1. Inner case --');
  });

  it('skips files with the opt-out marker', () => {
    const input = [
      '// separator-sweep: skip',
      '// ---------------------------------------------------------------------------',
      '// Header',
      '// ---------------------------------------------------------------------------',
    ].join('\n');
    const output = transformFile(input);
    expect(output).toBe(input);
  });

  it('is idempotent on canonical output', () => {
    const input = ['// -- Heading --', '', '// region | Helpers', 'function foo() {}', '// endregion | Helpers'].join(
      '\n',
    );
    const output = transformFile(input);
    expect(output).toBe(input);
  });

  it('is idempotent after a single sweep', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Helpers',
      '// ---------------------------------------------------------------------------',
      '',
      'function foo() {}',
      '',
      '// ---------------------------------------------------------------------------',
      '// Main',
      '// ---------------------------------------------------------------------------',
      '',
      'export const x = 1;',
    ].join('\n');
    const firstPass = transformFile(input);
    const secondPass = transformFile(firstPass);
    expect(secondPass).toBe(firstPass);
  });

  it('leaves files without separators unchanged', () => {
    const input = 'export const x = 1;\nexport const y = 2;\n';
    expect(transformFile(input)).toBe(input);
  });

  it('does not match a 3-line box with mismatched bar kinds', () => {
    const input = [
      '// ---------------------------------------------------------------------------',
      '// Mixed',
      '// ================================================================',
      'const x = 1;',
    ].join('\n');
    // The top dash line does not pair with an equals bottom; leave untouched.
    const output = transformFile(input);
    expect(output).toBe(input);
  });
});
