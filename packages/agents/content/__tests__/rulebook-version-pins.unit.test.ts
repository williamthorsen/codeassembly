import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ResolvedRulebook } from '../../src/lib/rulebook-deploy.ts';
import { resolveEveryRulebook } from '../test-utils/resolve-every-rulebook.ts';

// A rulebook's version names the guidance an agent holds, and `revise-prose` keys a repository's sweep coverage on it,
// so a body that changes without a bump leaves every repository recorded as swept against rule text that has since
// moved. The include expansion is what makes the gap invisible: editing a partial changes the deployed body of every
// rulebook that includes it while touching no rulebook file.
//
// The pins below are what force the look. A body edit fails this suite until the author decides which of the two
// remedies applies, and the failure message states both.

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** A phrase of `_partials/prose-line-breaks.md` that `commit-conventions` reaches only by including the partial. */
const INCLUDED_PARTIAL_MARKER = '**No hard line breaks.**';

interface RulebookPin {
  readonly bodyHash: string;
  readonly version: string;
}

/** The version each rulebook declares, and the deployed body that version is pinned against. */
const PINS = new Map<string, RulebookPin>([
  [
    'codeassembly-content-specification',
    { bodyHash: '35bf26ff2331a1d240e6bca2a263cac0962dd90a959f953715f85bb2d543e5c5', version: '20' },
  ],
  [
    'commit-conventions',
    { bodyHash: '630e5db1761a39f8e4ee50ffd4a31dd22903e6775d17d1ee279cb636c352ed6a', version: '6' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: 'f6423f87b76fe9c1735a891f58493a4e4f3b3db2065bbfab1600a5bf5f3f22b2', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: 'd48a6fe25f76ec35b2d5140635ba01aba9f933b59527fdaa3ff3fb86e726b327', version: '2' },
  ],
  ['shell-conventions', { bodyHash: '58e417219cce10f115ffddb9a946bc0162aee792644c19803f3312979e823616', version: '4' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: 'fedbd28b2c4690b481cc1fbee0c9575f879e4295a4e8522ecad754e40e1309cc', version: '4' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: 'cc7243a86429cb0f2ddeb97619a4e993f87fa46f260f86a9c83f2ddee0947067', version: '4' },
  ],
  [
    'williamthorsen-comment-preferences',
    { bodyHash: 'c7de4585d9a6b43480dd0cbe3950a893ab7cf1c1547e010e6b6eb62c139083b1', version: '3' },
  ],
  [
    'williamthorsen-ticketing-preferences',
    { bodyHash: '1ac392cec7c42907cb81dc83385065c908f984de828f711f207890c213d97024', version: '2' },
  ],
  [
    'williamthorsen-tooling-preferences',
    { bodyHash: '642d02b4d962bd39a15e98b5118646eef36c1d4188261d87d2bebf9da2d3cec7', version: '1' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: '978019f53427b8d4091f032d702d36f21b657cffe18034533c4d304aca5c4c2f', version: '4' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: 'c410c8a6a8e68d36cc1db4bfb60b054457510490149a290d5bb2a5d817319fc3', version: '4' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: '126ef21afc4924caf96f6a5daab7c6d2ea130f6597f9fc13f6b0300fca5c5d7f', version: '7' },
  ],
]);

const DRIFT_MESSAGE =
  "A rulebook's deployed body no longer matches the pin recorded for it. Choose one remedy: bump the rulebook's " +
  "`version` and re-pin both fields if the operative content moved, so every repository's record re-opens its " +
  'coverage for review; or re-pin the hash alone if the edit left the operative content as it was. An edit to an ' +
  'included partial counts as an edit to the body, which is why a rulebook can drift with its own file untouched.';

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
      'pinned body no longer covers the partials a rulebook inlines';
    expect((await RESOLVED).get('commit-conventions')?.body, message).toContain(INCLUDED_PARTIAL_MARKER);
  });

  // Every assertion above is negative, so a hash that stopped varying with the body would leave the suite green.
  it('reports drift from a one-character change', async () => {
    const body = (await RESOLVED).get('commit-conventions')?.body;

    expect(hashText(`${body} `)).not.toBe(PINS.get('commit-conventions')?.bodyHash);
  });
});

// region | Helpers

/** Hashes a resolved rulebook's body, or the empty string if the slug resolved to nothing. */
function hashBody(rulebook: ResolvedRulebook | undefined): string {
  return hashText(rulebook === undefined ? '' : rulebook.body);
}

/** Hashes text, whole rather than by its operative content: any edit at all reports drift. */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Renders a rulebook's pin as the literal that `PINS` takes, so a failure hands the author the line to paste. */
function renderPin(rulebook: ResolvedRulebook): string {
  return `{ bodyHash: '${hashText(rulebook.body)}', version: '${rulebook.version}' }`;
}

// endregion | Helpers
