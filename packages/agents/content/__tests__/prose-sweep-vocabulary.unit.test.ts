import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RULE_IDS } from '../../src/revise-prose/rules.ts';
import { resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';
import { listRuleMarkers, listRuleSections } from '../test-utils/rule-markers.ts';

// The rulebooks' `<!-- rule: <id> <version> -->` markers are the one list of rule names. The helper's detector registry,
// the names that `prose-reviser` reports, and the fold that `revise-prose` composes from that report each stay within
// it: a rejection under a rule that the skill leaves out of the fold's versioned rules makes the `record` command refuse
// the whole fold, and a rule stated without a marker leaves the subagent no id to report its sites under.
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

/**
 * The sentence in the skill that folds every rejection under a versioned rule. Pinned so a rewrite that reinstates a
 * filter by detector fails here.
 */
const FOLD_EVERY =
  '**Fold every rejection under a rule that `rules` names, whether or not the helper has its detector.**';

/** The skill's text versioning `plain-speech`, which no marker declares, in the invocation and in the fold. */
const PLAIN_SPEECH_VERSIONING: ReadonlyArray<string> = [
  '--rule plain-speech@{version}=plain-speech',
  '`plain-speech` included',
];

/** The dispatch key naming the file of already-adjudicated sites, as the skill's dispatch block writes it. */
const REJECTIONS_KEY = 'rejections:';

/** The same scalar as the subagent names it, so the two surfaces cannot drift onto different key names. */
const REJECTIONS_SCALAR = '**`rejections`**';

/** Matches every `"rule": "<name>"` field in a JSON example, whose captured group is the name. */
const REPORTED_RULE_REGEX = /"rule":\s*"([^"]+)"/g;

/** Matches a sweep version: a positive integer, which gives "rises" an order. */
const SWEEP_VERSION_REGEX = /^[1-9][0-9]*$/;

/** Matches the line naming a unit's version, whose captured group is the unit's name and, for `plain-speech`, its rule id. */
const UNIT_VERSION_REGEX = /^<!--\s*unit-version:\s*(\S+)\s+\S+\s*-->$/m;

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

  it('folds a rejection under every versioned name the subagent reports', async () => {
    const body = await readContentFile(SKILL);

    expect(body, `${SKILL} no longer folds every rejection, so a judgment is discarded again`).toContain(FOLD_EVERY);
    for (const versioning of PLAIN_SPEECH_VERSIONING) {
      expect(
        body,
        `${SKILL} does not version \`plain-speech\`, so the fold's rules leave it out and the record command refuses a plain-speech rejection`,
      ).toContain(versioning);
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

    const message = `no \`<!-- rule: <id> <version> -->\` marker declares ${missing.join(', ')}, so step 1 of ${SKILL} names it to no run: its detector never fires, every sweep reports clean for it, and the record stamps coverage anyway. Restore the marker in the rule's own document, or say here why the registry carries a rule that no document declares`;
    expect(missing, message).toEqual([]);
  });
});

describe('rule-id declarations', () => {
  it.each(SWEPT_RULEBOOKS)('%s declares its rule ids', async (slug) => {
    const rulebook = (await RESOLVED).get(slug);

    const message = `${slug} declares no \`<!-- rule: <id> <version> -->\` marker; therefore, none of its rules has an id that the sweep can report or record`;
    expect(rulebook, `${slug} is not in the library`).toBeDefined();
    expect(listDeclaredIds(rulebook?.body ?? ''), message).not.toEqual([]);
  });

  it('declares an id under every rule heading of a rulebook that declares any', async () => {
    const undeclared = (await RESOLVED)
      .values()
      .filter((rulebook) => listDeclaredIds(rulebook.body).length > 0)
      .flatMap((rulebook) => listUndeclaredHeadings(rulebook.body).map((heading) => `${rulebook.slug}: ${heading}`))
      .toArray();

    const message = `A rule heading has no \`<!-- rule: <id> <version> -->\` marker on the first non-blank line beneath it; therefore, the sweep has no id under which to report its sites: ${undeclared.join('; ')}`;
    expect(undeclared, message).toEqual([]);
  });

  it('declares a sweep version on every marker in the library', async () => {
    const unversioned = (await RESOLVED)
      .values()
      .flatMap((rulebook) =>
        listRuleMarkers(rulebook.body)
          .filter((marker) => marker.version === undefined || !SWEEP_VERSION_REGEX.test(marker.version))
          .map((marker) => `${rulebook.slug}: ${marker.id} (${marker.version ?? 'no version'})`),
      )
      .toArray();

    const message = `A rule marker declares no positive-integer sweep version. Write the marker as \`<!-- rule: <id> <version> -->\`, starting a new rule at 1: ${unversioned.join('; ')}`;
    expect(unversioned, message).toEqual([]);
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
  return listRuleMarkers(body).map((marker) => marker.id);
}

/** Returns the text of every rule heading whose first non-blank line beneath it is not a marker. */
function listUndeclaredHeadings(body: string): string[] {
  return listRuleSections(body)
    .filter((section) => section.marker === undefined)
    .map((section) => section.heading);
}

/**
 * Returns the rules that a body never names in backticks. A bare id such as `so` occurs in any prose and would assert
 * nothing.
 */
function listUnnamedRules(body: string, rules: ReadonlyArray<string>): string[] {
  return rules.filter((rule) => !body.includes(`\`${rule}\``));
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
