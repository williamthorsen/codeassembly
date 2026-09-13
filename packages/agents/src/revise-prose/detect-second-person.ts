/**
 * Second-person detection.
 *
 * The rule forbids a pronoun that addresses a reader of documentation and keeps one that addresses the agent that a
 * document instructs. The rulebook names that second case by document type, a skill body or a subagent body, and a path
 * identifies both without a reading, so their files are passed over here. Every other pronoun is reported, and whom it
 * names is the adjudicator's to decide.
 */
import { findMatchingSentences } from './span-text.ts';
import type { ProseSpan, SecondPersonCandidate } from './types.ts';

/**
 * Scans every span outside a skill or subagent body for a second-person pronoun, returning one candidate per sentence
 * that holds one, in reading order. The phrase is the sentence because one pronoun resolves to nothing: A rejection
 * recorded against it would match every other pronoun in the file.
 */
export function detectSecondPersonPronouns(spans: readonly ProseSpan[]): SecondPersonCandidate[] {
  return spans
    .filter((span) => !isAgentInstructionBody(span.file))
    .flatMap((span) =>
      findMatchingSentences(span, SECOND_PERSON).map(({ line, sentence }): SecondPersonCandidate => ({
        rule: 'second-person',
        file: span.file,
        line,
        phrase: sentence,
        sentence,
      })),
    );
}

// region | Helpers

/** Markdown file extensions, which are the forms that a skill or subagent body takes. */
const MARKDOWN_EXTENSION = /\.(?:markdown|md)$/i;

/**
 * Every pronoun that the rule names, in any case. A contraction such as `you're` matches through `you`, the apostrophe
 * ending the word.
 */
const SECOND_PERSON = /\byou(?:rs?|rself|rselves)?\b/giu;

/**
 * Reports whether a repository-relative path names a skill body or a subagent body: a `SKILL.md`, or a Markdown file
 * directly inside a `subagents/` or `.claude/agents/` directory. Only the immediate parent counts, since a package
 * directory named `agents` holds documentation for readers too.
 */
function isAgentInstructionBody(file: string): boolean {
  const segments = file.split('/');
  const name = segments.at(-1) ?? '';
  if (name === 'SKILL.md') return true;
  if (!MARKDOWN_EXTENSION.test(name)) return false;

  const parent = segments.at(-2);
  return parent === 'subagents' || (parent === 'agents' && segments.at(-3) === '.claude');
}

// endregion | Helpers
