/**
 * Evidence against candidate cuts: the commits that changed a phrase in its file, and the test string literals that a
 * phrase contains. The helper reports both; whether a commit corrected a failure, and whether a test depends on the
 * text, is the agent's judgment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { listWorkingTreeFiles } from './list-working-tree-files.ts';
import { normalizePhrase } from './normalize-phrase.ts';
import type { CheckInput, CheckReport, PhraseCommit, TestAssertion } from './types.ts';

/** Reports the history and the test assertions of each candidate cut. */
export function checkCuts(input: { root: string; cuts: readonly CheckInput[] }): CheckReport[] {
  const literals = listTestLiterals(input.root);
  return input.cuts.map((cut) => {
    const phrase = normalizePhrase(cut.phrase);
    return {
      ...cut,
      history: findPhraseHistory(input.root, cut),
      assertedBy: literals.filter((literal) => phrase.includes(normalizePhrase(literal.literal))),
    };
  });
}

/** Parses the candidate cuts from the JSON that the `check` command reads on standard input. */
export function parseCheckInput(json: string): CheckInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid check input: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const result = CheckInputSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid check input: ${detail}`);
  }
  return result.data.cuts;
}

// region | Helpers

const CheckInputSchema = z.object({
  cuts: z.array(z.object({ file: z.string().min(1), phrase: z.string().min(1) })),
});

/** Separates one commit's fields in the log format. */
const FIELD_SEPARATOR = '\u{1F}';

/** Output cap for one git invocation, sized past a long history or a large listing. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/** The most commits reported for one phrase. */
const HISTORY_LIMIT = 5;

/** The shortest literal compared against a phrase; a shorter one matches ordinary words by accident. */
const MIN_LITERAL_LENGTH = 12;

/** Separates one commit from the next in the log format. */
const RECORD_SEPARATOR = '\u{1E}';

/** Matches a single-quoted, double-quoted, or template string literal, each group holding one form's contents. */
const STRING_LITERAL_REGEX = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;

/** Matches a template literal's interpolation, whose text is code rather than a literal. */
const TEMPLATE_INTERPOLATION_REGEX = /\$\{[^}]*\}/;

/** Extensions of the script files whose literals a test asserts with. */
const TEST_SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);

/**
 * Returns the commits that changed how often the phrase occurs in its file, newest first and following renames. The
 * format is explicit, so a configured `format.pretty` or signature display cannot change what is parsed.
 */
function findPhraseHistory(root: string, cut: CheckInput): PhraseCommit[] {
  const stdout = execFileSync(
    'git',
    [
      'log',
      '--follow',
      '--no-show-signature',
      `--max-count=${HISTORY_LIMIT}`,
      `--format=%H${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`,
      `-S${cut.phrase}`,
      '--',
      cut.file,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] },
  );

  return stdout
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', date = '', subject = '', body = ''] = record.split(FIELD_SEPARATOR);
      return { sha, date, subject, body: body.trim() };
    });
}

/** Reports whether a repository-relative path is a test script: beneath `__tests__/`, or named `*.test.*` or `*.spec.*`. */
function isTestScript(file: string): boolean {
  if (!TEST_SCRIPT_EXTENSIONS.has(path.extname(file))) {
    return false;
  }
  return file.split('/').includes('__tests__') || /\.(?:spec|test)\.[^.]+$/.test(file);
}

/** Lists every string literal of at least the minimum length in the test scripts that git tracks or would track. */
function listTestLiterals(root: string): TestAssertion[] {
  const files = listWorkingTreeFiles(root).filter((file) => isTestScript(file));

  const literals: TestAssertion[] = [];
  for (const file of files) {
    const content = readFileSync(path.join(root, file), 'utf8');
    let line = 1;
    let counted = 0;
    for (const match of content.matchAll(STRING_LITERAL_REGEX)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? '';
      for (let index = counted; index < match.index; index += 1) {
        if (content[index] === '\n') line += 1;
      }
      counted = match.index;
      for (const segment of raw.split(TEMPLATE_INTERPOLATION_REGEX)) {
        const literal = unescapeLiteral(segment);
        if (literal.trim().length >= MIN_LITERAL_LENGTH) {
          literals.push({ file, line, literal });
        }
      }
    }
  }
  return literals;
}

/** Resolves the escape sequences in a literal's source text, so the literal compares as the string that it denotes. */
function unescapeLiteral(text: string): string {
  return text.replaceAll(/\\(.)/gs, (_match, char: string) => {
    if (char === 'n') return '\n';
    if (char === 't') return '\t';
    return char;
  });
}

// endregion | Helpers
