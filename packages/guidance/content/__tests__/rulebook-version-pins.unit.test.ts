import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { type ResolvedRulebook, resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';
import { listRuleSections } from '../test-utils/rule-markers.ts';

// A rulebook's version names the guidance that an agent holds, so a body that changes without a bump reports one
// version for two different bodies. The include expansion is what makes the gap invisible: Editing a partial changes
// the deployed body of every rulebook that includes it without touching any rulebook file.
//
// The pins below are what force the look. A body edit fails this suite until the author decides which of the two
// remedies applies, and the failure message states both.

/** A phrase of `_partials/prose-line-breaks.md` that `commit-conventions` reaches only by including the partial. */
const INCLUDED_PARTIAL_MARKER = '**No hard line breaks.**';

/** A phrase of `_partials/reduced-object-relative.md` that the rule's section reaches only by including the partial. */
const INCLUDED_RULE_PHRASE = '**Repairs, in preference order.**';

/** A rule's section text and the sweep version declared by its marker. */
interface DeclaredRule {
  readonly text: string;
  readonly version: string | undefined;
}

interface RulebookPin {
  readonly bodyHash: string;
  readonly version: string;
}

interface RulePin {
  readonly sectionHash: string;
  readonly version: string;
}

/** The version that each rulebook declares, and the deployed body against which that version is pinned. */
const PINS = new Map<string, RulebookPin>([
  [
    'accessibility-conventions',
    { bodyHash: 'a36fdbc73a8052a77888144492f3ef612b3f3d78ad97c249b703e725f114d31a', version: '1' },
  ],
  [
    'codeassembly-content-specification',
    { bodyHash: '4ef95d146ccd3879d6620418b82772aab08f0168c8b90bd3586b9a1111bf0cdf', version: '27' },
  ],
  [
    'command-output-conventions',
    { bodyHash: 'b3e250da29b3c3d871e76cfe9a32f7a404c077c519c2a85c0b43a95065674186', version: '1' },
  ],
  [
    'commit-conventions',
    { bodyHash: '4f412f4c3c80dca26ca887e4138e17619aaeccbba2084d2053807b7f41e35634', version: '10' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: '3562a8832e8135553382d7251b0e2ce626495aa23c6d7829f65a31845ada0e08', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: 'b9afef082bd1fbb8e16001eab2d447df70453114717c999292fdc7ffcb3376f2', version: '2' },
  ],
  ['shell-conventions', { bodyHash: '103a9cc7851e27d5f263e5f135d6ef48fac38490973c43e899bff9479ec6b078', version: '4' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: '619c042ceaa8c83758f18368339d0d03821aa35d02acf68a1fae22dacd79f45a', version: '6' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: '8c34aaef91b47a65f73f5cc2d0e480c2168a772bb239b2cede579ec6bd93889e', version: '10' },
  ],
  [
    'williamthorsen-comment-preferences',
    { bodyHash: 'bf4d7b051fb0ebd70dc1e71a5d4897f592357a6c235793d32ac17dd3a0231988', version: '4' },
  ],
  [
    'williamthorsen-ticketing-preferences',
    { bodyHash: 'f2ace0fd6d1b7e15079ae0f7903f1eb80d015801e8bbdd5179268db793a4dc8b', version: '5' },
  ],
  [
    'williamthorsen-tooling-preferences',
    { bodyHash: '93d4984f451f95de6fff980eb3d92ea88bc4393ab849fe4a401a69b04ef042f6', version: '3' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: 'cd058c41986c8189c1bd5aa59e7a897e9b26e00d7b739c987f616e2814b9ba64', version: '4' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: 'baec5b9647682af4d4780390db6a2a12d1c0a3c1b87a3cbdd78c85d98803f88e', version: '7' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: '1eaeb3b9351dc69211da6cfed74dbd89345466eaf94bdf35acf8375170903219', version: '11' },
  ],
]);

// A rule's marker declares a sweep version, which rises only when the rule becomes stricter. Each rule's section is
// pinned against that version, so that a section edit fails this suite until the author decides whether the rule's
// version rises, a decision separate from whether the rulebook's does.

/**
 * The sweep version that each rule's marker declares, and the section against which that version is pinned. A rule
 * declared by the plain-speech calibration does not have a pin here, since the calibration is not included in any
 * rulebook: `plain-speech-calibration.unit.test.ts` pins the calibration's whole text instead.
 */
const RULE_PINS = new Map<string, RulePin>([
  ['apostrophes', { sectionHash: '8da94cdfe74162b635312b726ab52976f9afde10f63b8c4bf8e41187c5f9e7f5', version: '1' }],
  [
    'capitalization-after-colon',
    { sectionHash: '58ec61bdaea1ae6d2b092c93749893447830b2e09796e127cfcac17164a297d4', version: '1' },
  ],
  [
    'doc-descriptions',
    { sectionHash: 'dab4ed9fc5c11d9c4d240bd4aa9df47a199daffa298817a3ac70b109588d10b9', version: '1' },
  ],
  ['em-dash', { sectionHash: '2e81d75a4b2d0580112f983636b45376cf65243c4340b8d8769eefad69247ec2', version: '1' }],
  [
    'inline-comments',
    { sectionHash: 'b99006eae56846bd994efc6ae21fb163ac4dcf4b3b50bb1322f734520b3a98d0', version: '1' },
  ],
  ['line-wrapping', { sectionHash: '6cb583e22c0a9310f995e204516a15b7a06b0dd3edf6c5f386b6498727434fff', version: '1' }],
  [
    'reduced-object-relative',
    { sectionHash: 'b9bacdfc8ed42750f19bfae41dda9a07de29263b182e4e49d660876c886b780e', version: '1' },
  ],
  ['second-person', { sectionHash: '5b5fa597c03587feb40ba41386593007c04370bd01eb4e042bccf8e1b9e46427', version: '1' }],
  ['sentence-case', { sectionHash: 'e19ffdafdd6eb84f47e229d07871a70ab55114981c8052b365f4bd33330d9b18', version: '1' }],
  ['so', { sectionHash: '2ed8a0d1f531d1d33778f9006214931528d13f0ccd79ad004a87d05e0ba97bf3', version: '1' }],
  ['where', { sectionHash: 'de807a9bf2e30c9b97415507a2a0b67a216674032755cb6cf3e23e8d2019e397', version: '2' }],
]);

const DRIFT_MESSAGE =
  "A rulebook's deployed body no longer matches the pin recorded for it. Choose one remedy: bump the rulebook's " +
  '`version` and re-pin both fields if the operative content moved; or re-pin the hash alone if the edit left the ' +
  'operative content as it was. If the edit lies outside every rule section and some text that complied with a rule ' +
  "could now fail it, also raise that rule's sweep version, which is what re-opens the rule's coverage in every " +
  "repository's record. An edit to an included partial counts as an edit to the body, which is why a rulebook can " +
  'drift with its own file untouched.';

const RULE_DRIFT_MESSAGE =
  "A rule's section no longer matches the pin recorded for it. Choose one remedy: raise the sweep version on the " +
  "rule's marker and re-pin both fields if some text that complied with the old wording could fail the new one, or " +
  'if unsure; or re-pin the hash alone for a relaxation, a clarification, or a rewording. An edit to an included ' +
  "partial counts as an edit to the section, which is why a rule can drift with its rulebook's file untouched.";

const RESOLVED = resolveEveryRulebook(CONTENT_ROOT);

describe('rulebook version pins', () => {
  it('pins every versioned rulebook', async () => {
    const unpinned = (await RESOLVED)
      .values()
      .filter((rulebook) => rulebook.version !== undefined && !PINS.has(rulebook.slug))
      .map((rulebook) => `['${rulebook.slug}', ${renderPin(rulebook)}],`)
      .toArray();

    const message = `A versioned rulebook does not have a pin. Add to \`PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins only rulebooks that declare a version', async () => {
    const resolved = await RESOLVED;
    const orphaned = PINS.keys()
      .filter((slug) => resolved.get(slug)?.version === undefined)
      .toArray();

    const message = `A pin names a rulebook that is gone or that does not declare a version: ${orphaned.join(', ')}`;
    expect(orphaned, message).toEqual([]);
  });

  it('declares the pinned version', async () => {
    const resolved = await RESOLVED;
    const drifted = [...PINS]
      .filter(([slug, pin]) => resolved.get(slug)?.version !== pin.version)
      .map(([slug]) => slug);

    const message = `A rulebook declares a version other than its pinned one: ${drifted.join(', ')}`;
    expect(drifted, message).toEqual([]);
  });

  it('is pinned against the body as it stands', async () => {
    const resolved = await RESOLVED;
    const drifted = [...PINS]
      .filter(([slug, pin]) => hashBody(resolved.get(slug)) !== pin.bodyHash)
      .map(([slug]) => slug);

    expect(drifted, `${DRIFT_MESSAGE}\n  ${drifted.join('\n  ')}`).toEqual([]);
  });

  // The pin table cannot show that partial content is inside what it hashes, and that reach covers the one case an
  // author cannot see for themselves: a rulebook whose body moved while its own file stayed as it was.
  it('hashes the content of an included partial', async () => {
    const message =
      `commit-conventions reaches ${INCLUDED_PARTIAL_MARKER} only through an include, so its absence means the ` +
      'pinned body no longer covers the partials that a rulebook inlines';
    expect((await RESOLVED).get('commit-conventions')?.body, message).toContain(INCLUDED_PARTIAL_MARKER);
  });

  // Every assertion above is negative, so a hash that stopped varying with the body would leave the suite green.
  it('reports drift from a one-character change', async () => {
    const body = (await RESOLVED).get('commit-conventions')?.body;

    expect(hashText(`${body} `)).not.toBe(PINS.get('commit-conventions')?.bodyHash);
  });
});

describe('rule version pins', () => {
  it('pins every declared rule', async () => {
    const unpinned = (await readRuleSections())
      .entries()
      .filter(([id]) => !RULE_PINS.has(id))
      .map(([id, rule]) => `['${id}', ${renderRulePin(rule)}],`)
      .toArray();

    const message = `A declared rule does not have a pin. Add to \`RULE_PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins only rules that a marker declares', async () => {
    const sections = await readRuleSections();
    const orphaned = RULE_PINS.keys()
      .filter((id) => !sections.has(id))
      .toArray();

    const message = `A pin names a rule that is not declared by any marker: ${orphaned.join(', ')}`;
    expect(orphaned, message).toEqual([]);
  });

  it('declares the pinned sweep version', async () => {
    const sections = await readRuleSections();
    const drifted = [...RULE_PINS].filter(([id, pin]) => sections.get(id)?.version !== pin.version).map(([id]) => id);

    const message = `A rule's marker declares a sweep version other than its pinned one: ${drifted.join(', ')}`;
    expect(drifted, message).toEqual([]);
  });

  it('is pinned against each rule section as it stands', async () => {
    const sections = await readRuleSections();
    const drifted = [...RULE_PINS]
      .filter(([id, pin]) => hashText(sections.get(id)?.text ?? '') !== pin.sectionHash)
      .map(([id]) => id);

    expect(drifted, `${RULE_DRIFT_MESSAGE}\n  ${drifted.join('\n  ')}`).toEqual([]);
  });

  it('hashes the content of an included partial', async () => {
    const message =
      `reduced-object-relative reaches ${INCLUDED_RULE_PHRASE} only through an include, so its absence means the ` +
      'pinned section no longer covers the partial that states the rule';
    expect((await readRuleSections()).get('reduced-object-relative')?.text, message).toContain(INCLUDED_RULE_PHRASE);
  });

  it('reports drift from a one-character change', async () => {
    const text = (await readRuleSections()).get('where')?.text;

    expect(hashText(`${text} `)).not.toBe(RULE_PINS.get('where')?.sectionHash);
  });
});

// region | Helpers

/** Hashes a resolved rulebook's body, or the empty string if the slug resolved to nothing. */
function hashBody(rulebook: ResolvedRulebook | undefined): string {
  return hashText(rulebook === undefined ? '' : rulebook.body);
}

/** Hashes text, whole rather than by its operative content: Any edit at all reports drift. */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Reads the section and sweep version of every rule that a library rulebook declares, indexed by the rule's id. */
async function readRuleSections(): Promise<ReadonlyMap<string, DeclaredRule>> {
  return new Map(
    (await RESOLVED)
      .values()
      .flatMap((rulebook) => listRuleSections(rulebook.body))
      .flatMap((section): Array<[string, DeclaredRule]> =>
        section.marker === undefined
          ? []
          : [[section.marker.id, { text: section.text, version: section.marker.version }]],
      ),
  );
}

/** Renders a rulebook's pin as the literal that `PINS` takes, so that a failure hands the author the line to paste. */
function renderPin(rulebook: ResolvedRulebook): string {
  return `{ bodyHash: '${hashText(rulebook.body)}', version: '${rulebook.version}' }`;
}

/** Renders a rule's pin as the literal that `RULE_PINS` takes, so that a failure hands the author the line to paste. */
function renderRulePin(rule: DeclaredRule): string {
  return `{ sectionHash: '${hashText(rule.text)}', version: '${rule.version}' }`;
}

// endregion | Helpers
