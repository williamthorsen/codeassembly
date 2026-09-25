import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ResolvedRulebook } from '../../src/lib/rulebook-deploy.ts';
import { resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';
import { listRuleSections } from '../test-utils/rule-markers.ts';

// A rulebook's version names the guidance that an agent holds, so a body that changes without a bump reports one
// version for two different bodies. The include expansion is what makes the gap invisible: Editing a partial changes
// the deployed body of every rulebook that includes it while touching no rulebook file.
//
// The pins below are what force the look. A body edit fails this suite until the author decides which of the two
// remedies applies, and the failure message states both.

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

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
    'codeassembly-content-specification',
    { bodyHash: '1bd1cc6e01ae2bdd7fe5037f82843c947ec7beb0b256143b331e818664a0782c', version: '23' },
  ],
  [
    'commit-conventions',
    { bodyHash: '2e1ce57bcd5a4eecf1a5e0d75b4383809d222a382a70ef4e6d8c7bd51ebb383b', version: '10' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: '968e7a5bcc19d7562ceb19c3c97163803e4c484c5dfc6cdcc4a1856f326d91aa', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: '52782185ccfb9035606eb01610e0332abc8c90684909daeaa70e3456cada3bf4', version: '2' },
  ],
  ['shell-conventions', { bodyHash: 'c19e983da4149b03d4a3105d2a9c115a8b5545f036d8cfcace21d0da03e8f073', version: '4' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: 'defa4f720cbd50e1fc8830ca0552e6b4ec8b623006f0101ed981124caa86823c', version: '6' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: '09c396d44ff9a220fed42aaf7dd84108f417c47d0d6819fef1fab1850523d64e', version: '5' },
  ],
  [
    'williamthorsen-comment-preferences',
    { bodyHash: 'bf4d7b051fb0ebd70dc1e71a5d4897f592357a6c235793d32ac17dd3a0231988', version: '4' },
  ],
  [
    'williamthorsen-ticketing-preferences',
    { bodyHash: '7393090b122576fa1a9ded2fb9f77865a073964179b6646e9a4d518c000738b5', version: '3' },
  ],
  [
    'williamthorsen-tooling-preferences',
    { bodyHash: 'd62d615298a35a5c21ba0350ea9bcd0ab26eee044703716e9b2a4377922ee4c1', version: '1' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: '9ae7ee862d8ae5c16a478b1d9c1a8f5a3d0642d5d78a69ee5ec2fd52bd656ee1', version: '4' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: '1bdc24639f599ecda862dc86fe8ef7ce8c8c606e9c2f5051575c09e49d647971', version: '5' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: '5999cc67d2131ce2eb10705d2c04b95b317e5883a6d1206f550c2aa5c4db4df0', version: '9' },
  ],
]);

// A rule's marker declares a sweep version, which rises only when the rule becomes stricter. Each rule's section is
// pinned against that version, so that a section edit fails this suite until the author decides whether the rule's
// version rises, a decision separate from whether the rulebook's does.

/** The sweep version that each rule's marker declares, and the section against which that version is pinned. */
const RULE_PINS = new Map<string, RulePin>([
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
    { sectionHash: 'c618a58fa100ac9594a2df5fd4b53d44f31d654a097e69e570b26e1736f5090e', version: '1' },
  ],
  ['second-person', { sectionHash: '398f568c087a8a004d17ac1eacf21e9bff800063c67b884a55d4d053d5d29015', version: '1' }],
  ['sentence-case', { sectionHash: 'e19ffdafdd6eb84f47e229d07871a70ab55114981c8052b365f4bd33330d9b18', version: '1' }],
  ['so', { sectionHash: '2ed8a0d1f531d1d33778f9006214931528d13f0ccd79ad004a87d05e0ba97bf3', version: '1' }],
  ['where', { sectionHash: '95f7aa780c5110a9392d5377ad6078978a37dbfcd6ff631e7a884550c86aa67c', version: '1' }],
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

    const message = `A versioned rulebook has no pin. Add to \`PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins no rulebook that declares no version', async () => {
    const resolved = await RESOLVED;
    const orphaned = PINS.keys()
      .filter((slug) => resolved.get(slug)?.version === undefined)
      .toArray();

    const message = `A pin names a rulebook that is gone or that declares no version: ${orphaned.join(', ')}`;
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

    const message = `A declared rule has no pin. Add to \`RULE_PINS\`:\n  ${unpinned.join('\n  ')}`;
    expect(unpinned, message).toEqual([]);
  });

  it('pins no rule that no marker declares', async () => {
    const sections = await readRuleSections();
    const orphaned = RULE_PINS.keys()
      .filter((id) => !sections.has(id))
      .toArray();

    const message = `A pin names a rule that no marker declares: ${orphaned.join(', ')}`;
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
