import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Four documents stated the rules of an authored title, and the fourth was written because its author found no home to
// point at: `wrap-up` grew a local copy that duplicated the imperative-voice rule and added one that existed nowhere
// else. Nothing stopped it, and nothing would stop the next one. The ticket criterion behind this suite names three
// documents; the invariant is wider than any enumeration, since a subagent restating a rule is the same defect.
//
// Each probe keys on a string distinctive enough that only a restatement matches it. That catches the copy-and-adapt
// path the duplication actually took and misses a paraphrase written from scratch, which is the weaker half of the
// guard and the reason the pointers themselves carry no rule text to copy.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state a title-authoring rule; every other site reaches it through a pointer. */
const HOME = 'skills/_data/title-voice.md';

/** A rule of the authored title, paired with a pattern that matches a restatement of it. */
interface TitleRule {
  readonly label: string;
  readonly pattern: RegExp;
}

const RULES: ReadonlyArray<TitleRule> = [
  { label: 'the bug-versus-fix framing', pattern: /playback stutters/i },
  { label: 'the character bound', pattern: /\b72[\s-]?char/i },
  { label: 'the forbidden occasion titles', pattern: /address review findings|apply feedback/i },
  { label: 'the imperative-voice contrast', pattern: /task-oriented/i },
  { label: 'the no-backticks rule', pattern: /no backticks/i },
  { label: 'the ticket-reference prohibition', pattern: /no ticket reference/i },
];

const AUTHORED_FILES = readAuthoredFiles();

describe.each(RULES)('$label', (rule: TitleRule) => {
  it('is still stated in title-voice.md', async () => {
    const home = (await AUTHORED_FILES).find((file) => file.relativePath === HOME);

    const message =
      `No text in ${HOME} matches the probe for ${rule.label}, so the probe guards nothing and every other file ` +
      'passes it vacuously. Re-key it on the wording the file carries now, or drop the rule from this suite.';
    expect(home !== undefined && rule.pattern.test(home.content), message).toBe(true);
  });

  it('is stated in no content file but title-voice.md', async () => {
    const violations = (await AUTHORED_FILES)
      .filter((file) => file.relativePath !== HOME && rule.pattern.test(file.content))
      .map((file) => file.relativePath);

    const message =
      `The rules of an authored title are stated in ${HOME} alone, and every authoring site points at it. These ` +
      `files restate ${rule.label} instead:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** One authored Markdown file: its content-root-relative path and its text. */
interface AuthoredFile {
  readonly content: string;
  readonly relativePath: string;
}

/** Reads every authored Markdown file under the content root, so each probe scans the tree without re-reading it. */
async function readAuthoredFiles(): Promise<ReadonlyArray<AuthoredFile>> {
  const files = await listMarkdownFiles(CONTENT_ROOT);
  return Promise.all(
    files.map(async (file) => ({
      content: await readFile(file, 'utf8'),
      relativePath: path.relative(CONTENT_ROOT, file),
    })),
  );
}

// endregion | Helpers
