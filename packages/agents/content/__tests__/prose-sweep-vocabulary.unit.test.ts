import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RULE_IDS } from '../../src/revise-prose/rules.ts';
import { resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';

// The rulebooks' `<!-- rule: <id> -->` markers are the one list of rule names. The helper's detector registry, the
// names that `prose-reviser` reports, and the fold that `revise-prose` composes from that report each stay within it:
// a name that the skill maps to no unit makes the `record` command refuse the whole fold, and a rule stated without a
// marker leaves the subagent no id to report its sites under.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

const CALIBRATION = '_partials/plain-speech-calibration.md';
const SKILL = 'skills/revise-prose/SKILL.md';
const SUBAGENT = 'subagents/prose-reviser.md';

/**
 * The rulebooks written for the hooks whose fills `revise-prose` sweeps. Named rather than discovered from their
 * markers, so that a rulebook that loses every marker still fails.
 */
const SWEPT_RULEBOOKS: ReadonlyArray<string> = [
  'williamthorsen-comment-preferences',
  'williamthorsen-writing-preferences',
];

/** The sentence in the skill that folds every rejection. Pinned so a rewrite that reinstates a filter fails here. */
const FOLD_EVERY = '**Fold every rejection, whatever rule it names.**';

/** The sentences mapping each undetected rule to its unit, which step 1's rule-to-unit mapping does not reach. */
const UNIT_MAPPINGS: ReadonlyArray<string> = [
  '**A `plain-speech` rejection takes the `plain-speech` unit**',
  '**A rejection under a rule not declared by any marker takes the unit of the fill block that states the rule**',
];

/** The dispatch key naming the file of already-adjudicated sites, as the skill's dispatch block writes it. */
const REJECTIONS_KEY = 'rejections:';

/** The same scalar as the subagent names it, so the two surfaces cannot drift onto different key names. */
const REJECTIONS_SCALAR = '**`rejections`**';

/** Matches every `"rule": "<name>"` field in a JSON example, whose captured group is the name. */
const REPORTED_RULE_REGEX = /"rule":\s*"([^"]+)"/g;

/** Matches a rule heading, whose captured group is the heading text. */
const RULE_HEADING_REGEX = /^## (.+)$/;

/** Matches a marker alone on its line, whose captured group is the id. A marker quoted inside a sentence declares nothing. */
const RULE_MARKER_REGEX = /^<!--\s*rule:\s*([a-z][a-z0-9-]*)\s*-->$/;

/** Matches the line naming a unit's version, whose captured group is the unit's name and, for `plain-speech`, its rule id. */
const UNIT_VERSION_REGEX = /^<!--\s*unit-version:\s*(\S+)\s+\S+\s*-->$/m;

/** Stands in for a line inside a code fence, which is neither a heading nor a marker but is not blank. */
const FENCED_LINE = '<fenced>';

const RESOLVED = resolveEveryRulebook(CONTENT_ROOT);

describe('prose-sweep rule vocabulary', () => {
  it('reports only names the skill can map to a unit', async () => {
    const body = await readContentFile(SUBAGENT);
    const reported = body
      .matchAll(REPORTED_RULE_REGEX)
      .map(([, name]) => name)
      .toArray();
    const known = new Set<string>([...(await readDeclaredIds()), await readPlainSpeechId()]);
    const unknown = reported.filter((name) => name !== undefined && !known.has(name));

    const message = `${SUBAGENT} reports rule names that no marker declares: ${unknown.join(', ')}`;
    expect(unknown, message).toEqual([]);
    expect(reported.length, `${SUBAGENT} shows no report example, so this suite proves nothing`).toBeGreaterThan(0);
  });

  it('names every detector rule in the subagent that adjudicates it', async () => {
    const body = await readContentFile(SUBAGENT);
    const missing = listUnnamedRules(body, RULE_IDS);

    const message = `${SUBAGENT} never names \`${missing.join('`, `')}\`, so the sweeper meets a candidate under a rule not described by its own body`;
    expect(missing, message).toEqual([]);
  });

  it('folds a rejection under every name the subagent reports', async () => {
    const body = await readContentFile(SKILL);

    expect(body, `${SKILL} no longer folds every rejection, so a judgment is discarded again`).toContain(FOLD_EVERY);
    for (const mapping of UNIT_MAPPINGS) {
      expect(
        body,
        `${SKILL} maps no unit onto an undetected rule, so the fold names a unit it does not cover and the record command refuses it`,
      ).toContain(mapping);
    }
  });

  it('hands the recorded sites to the subagent that would otherwise re-adjudicate them', async () => {
    const skill = await readContentFile(SKILL);
    const subagent = await readContentFile(SUBAGENT);

    expect(skill, `${SKILL} names no \`${REJECTIONS_KEY}\` in its dispatch block`).toContain(REJECTIONS_KEY);
    expect(
      subagent,
      `${SUBAGENT} describes no \`${REJECTIONS_KEY}\` scalar, so the skill writes a file that nothing opens`,
    ).toContain(REJECTIONS_SCALAR);
  });

  it('carries a marker for every detector rule', async () => {
    const declared = new Set(await readDeclaredIds());
    const missing = RULE_IDS.filter((rule) => !declared.has(rule));

    const message = `no \`<!-- rule: <id> -->\` marker declares ${missing.join(', ')}, so step 1 of ${SKILL} names it to no run: its detector never fires, every sweep reports clean for it, and the record stamps coverage anyway. Restore the marker in the rule's own document, or say here why the registry carries a rule that no document declares`;
    expect(missing, message).toEqual([]);
  });
});

describe('rule-id declarations', () => {
  it.each(SWEPT_RULEBOOKS)('%s declares its rule ids', async (slug) => {
    const rulebook = (await RESOLVED).get(slug);

    const message = `${slug} declares no \`<!-- rule: <id> -->\` marker; therefore, none of its rules has an id that the sweep can report or record`;
    expect(rulebook, `${slug} is not in the library`).toBeDefined();
    expect(listDeclaredIds(rulebook?.body ?? ''), message).not.toEqual([]);
  });

  it('declares an id under every rule heading of a rulebook that declares any', async () => {
    const undeclared = (await RESOLVED)
      .values()
      .filter((rulebook) => listDeclaredIds(rulebook.body).length > 0)
      .flatMap((rulebook) => listUndeclaredHeadings(rulebook.body).map((heading) => `${rulebook.slug}: ${heading}`))
      .toArray();

    const message = `A rule heading has no \`<!-- rule: <id> -->\` marker on the first non-blank line beneath it; therefore, the sweep has no id under which to report its sites: ${undeclared.join('; ')}`;
    expect(undeclared, message).toEqual([]);
  });

  it('declares each id once across the library', async () => {
    const ids = await readDeclaredIds();
    const duplicated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

    const message = `A rule id is declared more than once, which gives a rule that has one unit two of them: ${duplicated.join(', ')}`;
    expect(duplicated, message).toEqual([]);
  });
});

// region | Helpers

/** Returns every rule id that a body declares, in order. */
function listDeclaredIds(body: string): string[] {
  return maskFencedLines(body).flatMap((line) => {
    const id = RULE_MARKER_REGEX.exec(line)?.[1];
    return id === undefined ? [] : [id];
  });
}

/** Returns the text of every rule heading whose first non-blank line beneath it is not a marker. */
function listUndeclaredHeadings(body: string): string[] {
  const lines = maskFencedLines(body);
  return lines.flatMap((line, index) => {
    const heading = RULE_HEADING_REGEX.exec(line)?.[1];
    if (heading === undefined) return [];
    const next = lines.slice(index + 1).find((candidate) => candidate.trim() !== '');
    return next !== undefined && RULE_MARKER_REGEX.test(next) ? [] : [heading];
  });
}

/**
 * Returns the rules that a body never names in backticks. A bare id such as `so` occurs in any prose and would assert
 * nothing.
 */
function listUnnamedRules(body: string, rules: ReadonlyArray<string>): string[] {
  return rules.filter((rule) => !body.includes(`\`${rule}\``));
}

/** Splits a body into lines, replacing each line of a code fence with a placeholder that matches no heading or marker. */
function maskFencedLines(body: string): string[] {
  let fenced = false;
  return body.split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return FENCED_LINE;
    }
    return fenced ? FENCED_LINE : line;
  });
}

/** Reads one content file by its path relative to the content root. */
async function readContentFile(relativePath: string): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
}

/** Reads every rule id that the library's rulebooks declare, a duplicate appearing once per declaration. */
async function readDeclaredIds(): Promise<string[]> {
  return (await RESOLVED)
    .values()
    .flatMap((rulebook) => listDeclaredIds(rulebook.body))
    .toArray();
}

/** Reads the `plain-speech` rule id from the unit-version line that names it. */
async function readPlainSpeechId(): Promise<string> {
  const id = UNIT_VERSION_REGEX.exec(await readContentFile(CALIBRATION))?.[1];
  if (id === undefined) throw new Error(`${CALIBRATION} has no unit-version line naming its unit`);
  return id;
}

// endregion | Helpers
