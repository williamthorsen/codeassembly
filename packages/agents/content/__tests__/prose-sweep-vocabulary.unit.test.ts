import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RULE_IDS } from '../../src/revise-prose/rules.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Three hand-written surfaces must agree on which rule names exist: the helper's detector registry, the vocabulary
// `prose-reviser` reports, and the fold `revise-prose` composes from that report. A name the subagent reports that
// step 1 of the skill maps to no unit reaches the helper naming a unit the fold does not cover, and the `record`
// command refuses the whole fold. Nothing else holds the three together.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

const SKILL = 'skills/revise-prose/SKILL.md';
const SUBAGENT = 'subagents/prose-reviser.md';

/**
 * Rule names the subagent may report that the helper holds no detector for. Each is recordable, so the skill has to map
 * it to a unit; a name added here without that mapping is the divergence that this suite exists to catch.
 */
const UNDETECTED_RULES: ReadonlyArray<string> = [
  'capitalization-after-colon',
  'plain-speech',
  'second-person',
  'sentence-case',
  'where',
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

/** The rule names the helper holds a detector for, as plain strings, which is how the body names them. */
const DETECTOR_RULES: ReadonlySet<string> = new Set(RULE_IDS);

/** Content-root directories holding the rule documents a marker sits in. */
const RULE_DOCUMENT_DIRS: ReadonlyArray<string> = ['_partials', 'guidance/rulebooks'];

/** Matches every `<!-- rule: <id> -->` marker, whose captured group is the rule id. */
const RULE_MARKER_REGEX = /<!--\s*rule:\s*(\S+)\s*-->/g;

describe('prose-sweep rule vocabulary', () => {
  it('keeps the undetected names free of a detector, so the constant stays true to its name', () => {
    const detected = UNDETECTED_RULES.filter((name) => DETECTOR_RULES.has(name));

    const message = `${detected.join(', ')} now has a detector, so it needs no entry in UNDETECTED_RULES`;
    expect(detected, message).toEqual([]);
  });

  it('reports only names the skill can map to a unit', async () => {
    const body = await readContentFile(SUBAGENT);
    const reported = body
      .matchAll(REPORTED_RULE_REGEX)
      .map(([, name]) => name)
      .toArray();
    const known = new Set<string>([...DETECTOR_RULES, ...UNDETECTED_RULES]);
    const unknown = reported.filter((name) => name !== undefined && !known.has(name));

    const message = `${SUBAGENT} reports rule names the fold has never heard of: ${unknown.join(', ')}`;
    expect(unknown, message).toEqual([]);
    expect(reported.length, `${SUBAGENT} shows no report example, so this suite proves nothing`).toBeGreaterThan(0);
  });

  it('names every detector rule in the subagent that adjudicates it', async () => {
    const body = await readContentFile(SUBAGENT);
    const missing = RULE_IDS.filter((rule) => !body.includes(rule));

    const message = `${SUBAGENT} never names ${missing.join(', ')}, so the sweeper meets a candidate under a rule not described by its own body`;
    expect(missing, message).toEqual([]);
  });

  it('names every undetected rule in the subagent that reports it', async () => {
    const body = await readContentFile(SUBAGENT);
    // Match the backticked form: a bare `where` matches any prose occurrence and would assert nothing.
    const missing = UNDETECTED_RULES.filter((rule) => !body.includes(`\`${rule}\``));

    const message = `${SUBAGENT} never names \`${missing.join('`, `')}\`, so a site it repairs is reported under an improvised name that the fold cannot map to a unit`;
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
    const declared = await readDeclaredRuleIds();
    const missing = RULE_IDS.filter((rule) => !declared.has(rule));

    const message = `no \`<!-- rule: <id> -->\` marker declares ${missing.join(', ')}, so step 1 of ${SKILL} names it to no run: its detector never fires, every sweep reports clean for it, and the record stamps coverage anyway. Restore the marker in the rule's own document, or say here why the registry carries a rule that no document declares`;
    expect(missing, message).toEqual([]);
  });
});

// region | Helpers

/** Reads one content file by its path relative to the content root. */
async function readContentFile(relativePath: string): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
}

/** Reads every rule id declared by a `<!-- rule: <id> -->` marker across the rule documents. */
async function readDeclaredRuleIds(): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();

  for (const directory of RULE_DOCUMENT_DIRS) {
    const files = await listMarkdownFiles(path.join(CONTENT_ROOT, directory));
    for (const file of files) {
      const markers = (await readFile(file, 'utf8')).matchAll(RULE_MARKER_REGEX);
      for (const [, id] of markers) {
        if (id !== undefined) ids.add(id);
      }
    }
  }

  return ids;
}

// endregion | Helpers
