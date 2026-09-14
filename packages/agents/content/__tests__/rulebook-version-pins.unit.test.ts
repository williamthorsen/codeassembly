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
    { bodyHash: '3462edd7034b915e9b3763c52db0c15e0acf35a2a2474a20ad0d96a22b243f39', version: '20' },
  ],
  [
    'commit-conventions',
    { bodyHash: 'f435e9003f66be24f5a8f2128fdb02c5b714851a2b94de55a12afa02a7a3f38e', version: '6' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: '6aa2875ba894d4274153d1a3b56cc77e96097a6177fc7f895a5d73b0e0e482d4', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: 'b9b45e2507f387b9ebbcbc8d15421c467bcc94f15ce7f543e8bfe47d9d4d1937', version: '2' },
  ],
  ['shell-conventions', { bodyHash: 'a9890c63f2a04f739ee97d0f28a230482d4bee705321c8af95a3ce84e14eb7ae', version: '4' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: '24c927de9d85a8510b2535eab5199683f70e28660fa8a2074ac52510b6c60bf1', version: '4' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: 'c73b0acf313dfbb77125c5c39bf51aed76f5f191fedf451206ba34d37cf3aa3a', version: '4' },
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
    { bodyHash: '3dd37d073db36de66449816392c1ca5ce6ffca1a9110d718b96e34e611505896', version: '4' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: 'b72b41b05bfc17de4d78bf9019f93631740bdad14b3383228719846c3f8c782d', version: '4' },
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
