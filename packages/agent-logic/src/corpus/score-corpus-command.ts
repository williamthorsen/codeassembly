import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  CORPUS_DIRECTORY,
  readCorpus,
  renderPromptScore,
  renderScorecard,
  SCORECARD_FILE,
  SOURCE_FILES,
  type SourceFiles,
} from './score-corpus.ts';

export interface ScoreArgs {
  sources: SourceFiles;
  /** The one prompt to score, when the scorecard is not written. */
  prompt: string | undefined;
}

/**
 * Reads `score-corpus`'s arguments: `--prompt <name>` to score one prompt, and `--skill <path>` to compare results
 * against another copy of the skill, resolved against the working directory. Throws when the skill file does not exist.
 */
export function parseScoreArgs(args: string[]): ScoreArgs {
  const { values } = parseArgs({ args, options: { prompt: { type: 'string' }, skill: { type: 'string' } } });
  const skill = values.skill === undefined ? SOURCE_FILES.skill : path.resolve(values.skill);
  if (!existsSync(skill)) throw new Error(`score-corpus: the skill file ${skill} does not exist`);
  return { sources: { ...SOURCE_FILES, skill }, prompt: values.prompt };
}

if (import.meta.main) {
  const { sources, prompt } = parseScoreArgs(process.argv.slice(2));
  if (prompt === undefined) {
    const file = path.join(CORPUS_DIRECTORY, SCORECARD_FILE);
    writeFileSync(file, renderScorecard(readCorpus(CORPUS_DIRECTORY, sources)));
    process.stdout.write(`score-corpus: wrote ${file}\n`);
  } else {
    process.stdout.write(renderPromptScore(CORPUS_DIRECTORY, prompt));
  }
}
