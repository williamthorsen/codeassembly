import { describe, expect, it } from 'vitest';

import { isBarrelModule } from '../is-barrel-module.ts';

describe(isBarrelModule, () => {
  it('accepts a file of re-exports alone', () => {
    expect(isBarrelModule("export { parseNote } from './parse-note.ts';")).toBe(true);
  });

  it('accepts a star re-export', () => {
    expect(isBarrelModule("export * from './parse-note.ts';")).toBe(true);
  });

  it('accepts a type-only re-export', () => {
    expect(isBarrelModule("export type { ParsedNote } from './parse-note.ts';")).toBe(true);
  });

  it('accepts a re-export beside a side-effect import', () => {
    expect(isBarrelModule("import '@vendor/core/styles.css';\nexport { Card } from '@vendor/core';")).toBe(true);
  });

  it('accepts an import paired with a bare export clause', () => {
    expect(isBarrelModule("import { parseNote } from './parse-note.ts';\nexport { parseNote };")).toBe(true);
  });

  it('rejects a module carrying a declaration of its own', () => {
    expect(isBarrelModule("export { parseNote } from './parse-note.ts';\nexport const VERSION = 1;")).toBe(false);
  });

  it('rejects a module whose exports are all declarations', () => {
    expect(isBarrelModule('export function parseNote(): void {}')).toBe(false);
  });

  it('rejects a module of imports alone', () => {
    expect(isBarrelModule("import '@vendor/core/styles.css';")).toBe(false);
  });

  it('rejects an empty module', () => {
    expect(isBarrelModule('')).toBe(false);
  });
});
