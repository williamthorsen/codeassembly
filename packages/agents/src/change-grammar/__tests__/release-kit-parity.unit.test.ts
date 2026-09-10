import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileTemplate } from '../compile-template.ts';
import { parse } from '../parse.ts';
import { TEMPLATE_CATALOGUE } from '../templates.ts';
import type { Taxonomy } from '../types.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { aliases: ['feature'], key: 'feat', tier: 'public' },
    { aliases: [], key: 'drop', tier: 'public' },
    { aliases: ['bugfix'], key: 'fix', tier: 'public' },
    { aliases: ['security'], key: 'sec', tier: 'public' },
    { aliases: [], key: 'refactor', tier: 'internal' },
    { aliases: ['doc'], key: 'docs', tier: 'process' },
  ],
};

/** Piped-scope subjects both readers are expected to agree on. */
const SUBJECTS = [
  'agents|feat: Add foo',
  'feat: Add foo',
  'agents|feat!: Remove the deprecated API',
  'fix: Correct the guard',
  'feature: Add foo',
  '#466 agents|docs: Rewrite the README',
  '#466.1 agents|fix: Correct the guard',
  'MAC-147 sec!: Patch the parser',
  'run-core|refactor: Rename the lane fold',
  'Rename kb|docs: the shared layer',
  'Support a|b: syntax',
  'Add foo',
];

const parseCommitMessage = await loadReleaseKitParser();
const RELEASE_KIT_WORK_TYPES = Object.fromEntries(
  TAXONOMY.types.map((entry) => [entry.key, { aliases: [...(entry.aliases ?? [])], header: entry.key }]),
);

describe('release-kit parity', () => {
  it.each(SUBJECTS)('reads "%s" as release-kit does', (subject) => {
    const nodes = compileTemplate(TEMPLATE_CATALOGUE.pipedScope);
    const ours = parse(nodes, subject, TAXONOMY);
    const theirs = parseCommitMessage(subject, '0000000', RELEASE_KIT_WORK_TYPES);

    if (theirs === undefined) {
      expect(ours).toBeUndefined();
      return;
    }
    expect({
      breaking: ours?.breaking === true,
      description: ours?.title,
      scope: ours?.scope,
      type: ours?.type,
    }).toStrictEqual({
      breaking: theirs.breaking,
      description: theirs.description,
      scope: theirs.scope,
      type: theirs.type,
    });
  });
});

// region | Helpers

/** The shape of release-kit's commit parser, narrowed to what this suite calls. */
type ParseCommitMessage = (
  message: string,
  hash: string,
  workTypes: Record<string, { aliases?: string[]; header: string }>,
) => { breaking: boolean; description: string; scope?: string; type: string } | undefined;

/**
 * Loads the installed release-kit parser by absolute path. Its `exports` map publishes neither the module nor the
 * function, so the suite reads the installed build directly rather than through the package entry point.
 */
async function loadReleaseKitParser(): Promise<ParseCommitMessage> {
  const modulePath = resolveReleaseKitModule();
  const loaded: unknown = await import(/* @vite-ignore */ pathToFileURL(modulePath).href);
  if (typeof loaded !== 'object' || loaded === null || !('parseCommitMessage' in loaded)) {
    throw new Error(`No parseCommitMessage export at ${modulePath}.`);
  }
  const exported = loaded.parseCommitMessage;
  if (typeof exported !== 'function') {
    throw new TypeError(`parseCommitMessage at ${modulePath} is not a function.`);
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- typing the installed build precisely would obscure the fixtures this suite is about.
  return exported as ParseCommitMessage;
}

/** Walks up from this suite to the installed release-kit build, which pnpm may place at any ancestor. */
function resolveReleaseKitModule(): string {
  const ancestors = ancestorDirectories(import.meta.dirname);
  for (const dir of ancestors) {
    const candidate = path.join(
      dir,
      'node_modules',
      '@williamthorsen',
      'release-kit',
      'dist',
      'esm',
      'parseCommitMessage.js',
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No installed @williamthorsen/release-kit found above this suite.');
}

/** Yields the starting directory and every ancestor of it, up to the filesystem root. */
function* ancestorDirectories(start: string): Generator<string> {
  let dir = start;
  yield dir;
  let parent = path.dirname(dir);
  while (parent !== dir) {
    dir = parent;
    yield dir;
    parent = path.dirname(dir);
  }
}

// endregion | Helpers
