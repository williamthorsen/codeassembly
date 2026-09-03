import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RULE_IDS } from '../../src/revise-prose/rules.ts';

// Three hand-written surfaces must agree on which rule names exist: the helper's detector registry, the vocabulary
// `prose-reviser` reports, and the fold `revise-prose` composes from that report. The helper validates a fold against
// its registry and refuses a name outside it, so a report vocabulary the skill forwards unfiltered ends the run with
// no record written. Nothing else holds the three together.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

const SKILL = 'skills/revise-prose/SKILL.md';
const SUBAGENT = 'subagents/prose-reviser.md';

/**
 * Rule names the subagent may report that the helper holds no detector for. The fold refuses them, so the skill has to
 * drop them; a name added here without that filter is the divergence this suite exists to catch.
 */
const NON_RECORDABLE: ReadonlyArray<string> = ['plain-speech'];

/** The sentence in the skill that performs the drop. Pinned so a rewrite that loses it fails here. */
const FOLD_FILTER = '**Fold only a rejection whose `rule` is one of the detector rules from step 1.**';

/** Matches every `"rule": "<name>"` field in a JSON example, whose captured group is the name. */
const REPORTED_RULE_REGEX = /"rule":\s*"([^"]+)"/g;

/** The rule names the helper holds a detector for, as plain strings, which is how the body names them. */
const DETECTOR_RULES: ReadonlySet<string> = new Set(RULE_IDS);

describe('prose-sweep rule vocabulary', () => {
  it('keeps the recordable and non-recordable names disjoint', () => {
    const overlap = NON_RECORDABLE.filter((name) => DETECTOR_RULES.has(name));

    const message = `${overlap.join(', ')} is both a detector rule and one the skill drops from the fold; a detector rule is recordable, so drop it from NON_RECORDABLE and from the skill's filter`;
    expect(overlap, message).toEqual([]);
  });

  it('reports only names the fold accepts or the skill drops', async () => {
    const body = await readContentFile(SUBAGENT);
    const reported = body
      .matchAll(REPORTED_RULE_REGEX)
      .map(([, name]) => name)
      .toArray();
    const known = new Set<string>([...DETECTOR_RULES, ...NON_RECORDABLE]);
    const unknown = reported.filter((name) => name !== undefined && !known.has(name));

    const message = `${SUBAGENT} reports rule names the fold has never heard of: ${unknown.join(', ')}`;
    expect(unknown, message).toEqual([]);
    expect(reported.length, `${SUBAGENT} shows no report example, so this suite proves nothing`).toBeGreaterThan(0);
  });

  it('names every detector rule in the subagent that adjudicates it', async () => {
    const body = await readContentFile(SUBAGENT);
    const missing = RULE_IDS.filter((rule) => !body.includes(rule));

    const message = `${SUBAGENT} never names ${missing.join(', ')}, so the sweeper meets a candidate under a rule its own body does not describe`;
    expect(missing, message).toEqual([]);
  });

  it('drops every non-recordable name from the fold', async () => {
    const body = await readContentFile(SKILL);

    expect(
      body,
      `${SKILL} no longer filters the fold; the helper refuses a non-detector rule and the run ends with no record`,
    ).toContain(FOLD_FILTER);
    for (const name of NON_RECORDABLE) {
      expect(body, `${SKILL} does not say what becomes of a ${name} rejection`).toContain(name);
    }
  });
});

// region | Helpers

/** Reads one content file by its path relative to the content root. */
async function readContentFile(relativePath: string): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
}

// endregion | Helpers
