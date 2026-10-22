import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type FakeGit, makeFakeGit, makeRawCommit } from './make-fake-git.ts';

/** A taxonomy declaring only the types that the suite names, in the order that its ranking cases read. */
export const DATA_DIR = fileURLToPath(new URL('../__tests__/fixtures/data', import.meta.url));

/** A commit template that the engine cannot round-trip, since nothing separates the scope from the type. */
export const DEFECTIVE_TEMPLATES = "commit:\n  title_format: '{scope}{type}: {title}'";

/** An entries file in the shape that `entry-drafter` returns, naming one scope and one type. */
export const ENTRIES_YAML = [
  '- type: feat',
  '  scopes: [agents]',
  '  breaking: false',
  '  text: Adds the store-qualified wikilink',
  '- type: fix',
  '  scopes: [agents]',
  '  breaking: false',
  '  text: Stops the sync from deleting a subagent',
].join('\n');

/** The house title templates for every surface, as a preferences file declares them. */
export const HOUSE_TEMPLATES = [
  "commit:\n  title_format: '[[{scope}|]{type}: ]{title}'",
  "ticket:\n  title_format: '{title}'",
  "pr:\n  title_format: '[{ticket_ref} ]{title}'",
  "merge:\n  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]'",
].join('\n');

/** A label map naming the types and scopes that the `resolve-labels` fixtures use. */
export const LABEL_MAP = {
  scopes: { agents: 'scope:agents', kb: 'scope:kb' },
  types: { drop: 'removal', feat: 'feature', fix: 'fix' },
};

/**
 * Creates a project whose fake git knows only the pull request's head commit and lists one commit per message for its
 * range.
 */
export async function makePullRequestRepo(
  messages: readonly string[],
): Promise<{ cwd: string; git: FakeGit; headCommit: string; home: string }> {
  const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
  const headCommit = 'fedcba9876543210fedcba9876543210fedcba98';
  const git = makeFakeGit({ commits: messages.map(makeRawCommit), knownRefs: [headCommit], topLevel: cwd });
  return { cwd, git, headCommit, home };
}

/** Creates a project root with `content` as its preferences and a fake git rooted there, plus an empty global home. */
export async function makeRepo(content: string): Promise<{ cwd: string; git: FakeGit; home: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'describe-change-repo-'));
  await writeAgentsPreferences(cwd, content);
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  return { cwd, git: makeFakeGit({ topLevel: cwd }), home };
}

/** Returns the pull-request flags that `resolve-merge` requires beside `--base` and `--head`, reading the body from `bodyFile`. */
export function pullRequestFlags(bodyFile: string): string[] {
  return ['--pr-title', '#466 Add the parser', '--pr-body-file', bodyFile, '--pr-number', '470'];
}

/** Writes `content` to `.agents/preferences.yaml` under `root`. */
export async function writeAgentsPreferences(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.agents'), { recursive: true });
  await writeFile(join(root, '.agents', 'preferences.yaml'), `${content}\n`, 'utf8');
}

/** Writes `content` to a pull-request body file under a scratch directory and returns its path. */
export async function writeBody(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'describe-change-body-'));
  const bodyFile = join(dir, 'body.md');
  await writeFile(bodyFile, content, 'utf8');
  return bodyFile;
}

/** Writes `content` to an entries file under a scratch directory and returns its path. */
export async function writeEntries(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'describe-change-entries-'));
  const entriesFile = join(dir, 'entries.yaml');
  await writeFile(entriesFile, `${content}\n`, 'utf8');
  return entriesFile;
}

/** Writes `labelMap` to the repository's `.meta/label-map.json`. */
export async function writeLabelMap(root: string, labelMap: unknown): Promise<void> {
  await mkdir(join(root, '.meta'), { recursive: true });
  await writeFile(join(root, '.meta', 'label-map.json'), JSON.stringify(labelMap));
}
