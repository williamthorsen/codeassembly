import { detectObjectRelatives } from '../detect-object-relative.ts';
import type { ObjectRelativeCandidate } from '../types.ts';

/** Detects over one sentence held in a single span, which is how every lexical assertion below is phrased. */
export function detect(sentence: string): ObjectRelativeCandidate[] {
  return detectObjectRelatives([{ file: 'fixture.md', line: 1, text: sentence }]);
}
