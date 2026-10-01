import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ContentDefect } from '../content-defects.ts';
import { listMarkdownFilesRecursively, readDirEntries } from '../fs-helpers.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/**
 * The template that the install pipeline expands to each harness's scripts directory. A helper script installs to
 * `~/<harness_home>/scripts/`, which is not on `$PATH`, so a bare invocation leaves the agent guessing a path.
 */
const REQUIRED_PREFIX = '{harness_home_dir}/scripts/';

/** The trees whose Markdown an agent executes from. */
const HOST_DIRECTORIES: ReadonlyArray<string> = ['skills', 'subagents'];

/**
 * Executable context after a script name: a CLI flag, a line continuation, a quoted argument, a shell variable, or a
 * shell operator. Anything else (a closing backtick, a prose word, punctuation) leaves the name a mention.
 */
const INVOCATION_SUFFIX = /^(?:--|-[A-Za-z]|\\\s*$|"|'|\$[A-Za-z_(@{*]|\||>|<|;|&)/;

/** Executable context before a script name: an interpreter word as the token directly preceding it. */
const INTERPRETER_PREFIX = /(?:^|[\s`'"])(?:bash|node|sh|source|zsh)[ \t]+$/;

/**
 * Reports every executable invocation of a known helper script, in a Markdown file under the root's `skills/` or
 * `subagents/`, that lacks the `{harness_home_dir}/scripts/` prefix. One defect per site.
 *
 * The known scripts are the files directly under the root's `scripts/` and the library's, which is where a name
 * resolves at a consumer.
 */
export async function findScriptInvocationDefects({
  root,
  libraryDir,
}: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const scripts = await listKnownScripts([root, libraryDir]);
  if (scripts.length === 0) {
    return [];
  }

  const defects: Array<ContentDefect> = [];
  for (const directory of HOST_DIRECTORIES) {
    const files = await listMarkdownFilesRecursively(path.join(root, directory));
    for (const file of files) {
      const relativePath = toRootRelative(root, file);
      let body: string;
      try {
        body = await readFile(file, 'utf8');
      } catch (error: unknown) {
        defects.push({ file: relativePath, kind: 'invocation', detail: describeError(error) });
        continue;
      }
      for (const [index, line] of body.split('\n').entries()) {
        for (const script of scripts) {
          if (containsBareInvocation(line, script)) {
            defects.push({
              file: relativePath,
              kind: 'invocation',
              detail:
                `Line ${index + 1} invokes \`${script}\` without the \`${REQUIRED_PREFIX}\` prefix: ${line.trim()}\n` +
                'A helper script installs to a directory that is not on `$PATH`; prefix the invocation.',
            });
          }
        }
      }
    }
  }
  return defects;
}

/**
 * Reports whether the text around a script name is executable context: an interpreter word directly before it, or
 * an invocation suffix directly after it.
 */
export function isInvocationContext(before: string, after: string): boolean {
  return INTERPRETER_PREFIX.test(before) || INVOCATION_SUFFIX.test(after.replace(/^[ \t]+/, ''));
}

// region | Helpers

/** Reports whether `line` invokes `script` anywhere without the required prefix. */
function containsBareInvocation(line: string, script: string): boolean {
  let searchFrom = 0;
  while (searchFrom <= line.length) {
    const index = line.indexOf(script, searchFrom);
    if (index === -1) {
      return false;
    }
    searchFrom = index + script.length;
    const before = line.slice(0, index);
    // Skip a match inside a longer token, and the prefixed form.
    if (/[A-Za-z0-9]$/.test(before) || before.endsWith(REQUIRED_PREFIX)) {
      continue;
    }
    if (isInvocationContext(before, line.slice(searchFrom))) {
      return true;
    }
  }
  return false;
}

/**
 * Lists the distinct script names shipped directly under each root's `scripts/`, sorted. A Markdown file there
 * documents the scripts rather than being one.
 */
async function listKnownScripts(roots: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
  const names = new Set<string>();
  for (const root of roots) {
    const entries = await readDirEntries(path.join(root, 'scripts'));
    for (const entry of entries) {
      if (entry.isFile() && path.extname(entry.name) !== '.md') {
        names.add(entry.name);
      }
    }
  }
  return [...names].toSorted();
}

// endregion | Helpers
