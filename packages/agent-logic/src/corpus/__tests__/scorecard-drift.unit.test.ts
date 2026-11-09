import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORPUS_DIRECTORY, readCorpus, renderScorecard } from '../score-corpus.ts';

describe('corpus/scorecard.md', () => {
  it('matches the scorecard that the corpus files produce', () => {
    const committed = readFileSync(path.join(CORPUS_DIRECTORY, 'scorecard.md'), 'utf8');

    expect(committed).toBe(renderScorecard(readCorpus(CORPUS_DIRECTORY)));
  });
});
