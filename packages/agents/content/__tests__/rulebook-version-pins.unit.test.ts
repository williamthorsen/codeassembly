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
    { bodyHash: 'b17aadf80d9445453a12ab65228bf850b9a7320850748af1947809f6324840a3', version: '21' },
  ],
  [
    'commit-conventions',
    { bodyHash: '39f197e4d6eb3f1fea988d051edea69328fe023dff10a568dceb71ef5acdbb29', version: '6' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: '9bf4e540df49c6b7cb4f9ace460c083f796adab52a6c7abbe6dd4270117a27c0', version: '2' },
  ],
  [
    'readme-conventions',
    { bodyHash: '52782185ccfb9035606eb01610e0332abc8c90684909daeaa70e3456cada3bf4', version: '2' },
  ],
  ['shell-conventions', { bodyHash: 'c19e983da4149b03d4a3105d2a9c115a8b5545f036d8cfcace21d0da03e8f073', version: '4' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: '44695db7aa8d63ef175922dbb8862c672f006b6c3f2f94304cac0a9388f71efa', version: '4' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: '959bbb39cfe4b1df32b8e6203f2ca39e9109d845615663dc86ae60b4e3b9fed8', version: '4' },
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
    { bodyHash: 'd62d615298a35a5c21ba0350ea9bcd0ab26eee044703716e9b2a4377922ee4c1', version: '1' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: '9ae7ee862d8ae5c16a478b1d9c1a8f5a3d0642d5d78a69ee5ec2fd52bd656ee1', version: '4' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: '719159dd46eed3bab3a76be3abd973fbabab9d573f448c5dc0a3dd296a0b73db', version: '4' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: 'f9b2224488cad7913d04ee9a5eaf6408791a9edd857737b333ee2819b69fb6c7', version: '8' },
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
