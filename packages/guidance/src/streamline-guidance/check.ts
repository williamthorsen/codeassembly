/**
 * Evidence against candidate cuts. The helper gathers the evidence; whether a commit corrected a failure, and whether
 * a test depends on the text, is the agent's judgment.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import type { StreamlineGit } from './git.ts';
import { listWorkingTreeFiles } from './list-working-tree-files.ts';
import { normalizePhrase } from './normalize-phrase.ts';
import type { CheckInput, CheckReport, TestAssertion } from './types.ts';

/** Reports the history and the test assertions of each candidate cut. */
export function checkCuts(input: { cuts: readonly CheckInput[]; git: StreamlineGit; root: string }): CheckReport[] {
  const literals = listTestLiterals(input.root, input.git);
  return input.cuts.map((cut) => {
    const phrase = normalizePhrase(cut.phrase);
    return {
      ...cut,
      history: input.git.findPhraseHistory(input.root, cut.file, cut.phrase),
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

/** The shortest literal compared against a phrase; a shorter one matches ordinary words by accident. */
const MIN_LITERAL_LENGTH = 12;

/** Matches a single-quoted, double-quoted, or template string literal, each group capturing one form's contents. */
const STRING_LITERAL_REGEX = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;

/** Matches a template literal's interpolation, whose text is code rather than a literal. */
const TEMPLATE_INTERPOLATION_REGEX = /\$\{[^}]*\}/;

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

/** Reports whether a repository-relative path names a test script. */
function isTestScript(file: string): boolean {
  if (!TEST_SCRIPT_EXTENSIONS.has(path.extname(file))) {
    return false;
  }
  return file.split('/').includes('__tests__') || /\.(?:spec|test)\.[^.]+$/.test(file);
}

/** Lists every string literal of at least the minimum length in the repository's test scripts. */
function listTestLiterals(root: string, git: StreamlineGit): TestAssertion[] {
  const files = listWorkingTreeFiles(root, git).filter((file) => isTestScript(file));

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

/**
 * Resolves the escape sequences in a literal's source text, so that the literal is compared as the string that it
 * denotes.
 */
function unescapeLiteral(text: string): string {
  return text.replaceAll(/\\(.)/gs, (_match, char: string) => {
    if (char === 'n') return '\n';
    if (char === 't') return '\t';
    return char;
  });
}

// endregion | Helpers
