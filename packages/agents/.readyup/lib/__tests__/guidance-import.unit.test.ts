import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveGuidanceImports } from '../guidance-import.ts';

const REPO_ROOT = '/repo';
const IMPORTING_DIR = join(REPO_ROOT, '.claude');
const GUIDANCE_PATH = join(REPO_ROOT, 'AGENTS.md');

describe(resolveGuidanceImports, () => {
  it('reaches the guidance file through an import that resolves to it', () => {
    const outcome = resolveGuidanceImports('# CLAUDE.md\n\n@../AGENTS.md\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome.doesReachGuidance).toBe(true);
  });

  it('does not reach it through an import naming the guidance file but resolving beside the importer', () => {
    const outcome = resolveGuidanceImports('@AGENTS.md\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({
      doesReachGuidance: false,
      resolvedPaths: [join(IMPORTING_DIR, 'AGENTS.md')],
    });
  });

  it('does not reach it through an import spelled for the repository root', () => {
    const outcome = resolveGuidanceImports('@.agents/PROJECT.md\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({
      doesReachGuidance: false,
      resolvedPaths: [join(IMPORTING_DIR, '.agents/PROJECT.md')],
    });
  });

  it('does not reach it through a prose mention carrying no import', () => {
    const outcome = resolveGuidanceImports('Read ../AGENTS.md before starting.\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });

  it('reaches the guidance file when one of several imports resolves to it', () => {
    const document = '@./local-notes.md\n@../AGENTS.md\n';

    const outcome = resolveGuidanceImports(document, IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({
      doesReachGuidance: true,
      resolvedPaths: [join(IMPORTING_DIR, 'local-notes.md'), GUIDANCE_PATH],
    });
  });

  it('reaches the guidance file through an absolute import', () => {
    const outcome = resolveGuidanceImports(`@${GUIDANCE_PATH}\n`, IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome.doesReachGuidance).toBe(true);
  });

  it('resolves a home-relative import against the home directory', () => {
    const outcome = resolveGuidanceImports('@~/.claude/CLAUDE.md\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({
      doesReachGuidance: false,
      resolvedPaths: [join(homedir(), '.claude/CLAUDE.md')],
    });
  });

  it('reads an import written mid-line', () => {
    const outcome = resolveGuidanceImports('See @../AGENTS.md for details.\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome.doesReachGuidance).toBe(true);
  });

  it('reads no import from an address embedded in a word', () => {
    const outcome = resolveGuidanceImports('Mail william@example.com about it.\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });

  it('reads no import from a fenced code block', () => {
    const document = '# CLAUDE.md\n\n```markdown\n@../AGENTS.md\n```\n';

    const outcome = resolveGuidanceImports(document, IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });

  it('reads no import from a tilde-fenced code block', () => {
    const outcome = resolveGuidanceImports('~~~\n@../AGENTS.md\n~~~\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });

  it('reads no import from a fence left unclosed', () => {
    const outcome = resolveGuidanceImports('```\n@../AGENTS.md\n', IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });

  it('reads a live import beside a fenced block that shows another', () => {
    const document = '@../AGENTS.md\n\n```markdown\n@.agents/PROJECT.md\n```\n';

    const outcome = resolveGuidanceImports(document, IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: true, resolvedPaths: [GUIDANCE_PATH] });
  });

  it('reads no import from a code span holding a spaced path', () => {
    const document = 'Write ` @../AGENTS.md ` to import it.\n';

    const outcome = resolveGuidanceImports(document, IMPORTING_DIR, GUIDANCE_PATH);

    expect(outcome).toEqual({ doesReachGuidance: false, resolvedPaths: [] });
  });
});
