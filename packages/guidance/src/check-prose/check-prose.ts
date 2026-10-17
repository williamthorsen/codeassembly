/**
 * Runs every revise-prose detector over one composed body, such as a change summary's passages, without the sweep
 * record: The body has neither a tracked path nor a record entry, so coverage and rejections do not apply to it.
 */
import { extractProse } from '../revise-prose/collect-prose.ts';
import { detectRules, RULE_IDS } from '../revise-prose/rules.ts';
import type { Candidate, RuleId } from '../revise-prose/types.ts';

/** The outcome of checking one file: the rules that ran and the candidates that they reported. */
export interface ProseCheck {
  file: string;
  rules: readonly RuleId[];
  candidates: Candidate[];
}

/** Checks the content as Markdown, whatever the file's extension, with code spans and fences excluded. */
export function checkProse(input: { file: string; content: string }): ProseCheck {
  const spans = extractProse({ ...input, kind: 'markdown' });
  return { file: input.file, rules: RULE_IDS, candidates: detectRules(spans, RULE_IDS) };
}

/** Renders the check as the one JSON document that `--json` prints. */
export function renderCheckJson(check: ProseCheck): string {
  return `${JSON.stringify(check)}\n`;
}

/**
 * Renders one line per candidate, with the sentence's whitespace collapsed so that each candidate stays on one line,
 * then a line counting the candidates.
 */
export function renderCheckText(check: ProseCheck): string {
  const lines = check.candidates.map(
    (candidate) =>
      `${candidate.file}:${candidate.line}: ${candidate.rule}: ${candidate.sentence.replaceAll(/\s+/g, ' ').trim()}`,
  );
  lines.push(`${check.file}: ${check.candidates.length} candidate(s)`);
  return `${lines.join('\n')}\n`;
}
