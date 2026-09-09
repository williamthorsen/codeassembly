import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { libraryResolver } from '../../src/lib/content-sources.ts';
import { enumerateCatalogSlugs } from '../../src/lib/library-catalog.ts';
import { indexRulebooksBySlug, type ResolvedRulebook, resolveRulebook } from '../../src/lib/rulebook-deploy.ts';

// A rulebook's version names the guidance an agent holds, and `revise-prose` keys a repository's sweep coverage on it,
// so a body that changes without a bump leaves every repository recorded as swept against rule text that has since
// moved. The include expansion is what makes the gap invisible: editing a partial changes the deployed body of every
// rulebook that includes it while touching no rulebook file.
//
// The pins below are what force the look. A body edit fails this suite until the author decides which of the two
// remedies applies, and the failure message states both.

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** A phrase of `_partials/voice-checklist.md` that `commit-conventions` reaches only by including the partial. */
const INCLUDED_PARTIAL_MARKER = '**Matter of course.**';

interface RulebookPin {
  readonly bodyHash: string;
  readonly version: string;
}

/** The version each rulebook declares, and the deployed body that version is pinned against. */
const PINS = new Map<string, RulebookPin>([
  [
    'codeassembly-content-specification',
    { bodyHash: 'a19fdaddf752c413158fbbae7687c58783148d7e246cb95856b91c7353ff51f6', version: '16' },
  ],
  [
    'commit-conventions',
    { bodyHash: 'dcc72e017ea6692f3b0f408ff81ad5f5bdd7c962f377db11e754227e19f927d1', version: '2' },
  ],
  [
    'generated-content-policy',
    { bodyHash: '2448d32434c2545e9dd8433bb153eb72ca6f35fca0db4702ed5a0198cebac942', version: '1' },
  ],
  [
    'live-worktree-policy',
    { bodyHash: 'bd46288d3fedfc65a9f7beada2b07a203aa2bb7c897378e34264e28d1e2b517c', version: '1' },
  ],
  ['shell-conventions', { bodyHash: 'aeef69f32baee5b75e4dd3975c2af42097dc6cdea6be97aa78ff7a0160ea136f', version: '3' }],
  [
    'williamthorsen-code-layout-preferences',
    { bodyHash: '24e2dd3891ca3f5bd8bbc30d6cb9c08cffd67df94748a049385d7c82924c47e0', version: '3' },
  ],
  [
    'williamthorsen-collaboration-preferences',
    { bodyHash: 'b2a5f3e2b3276dcf96fdea241ffbedc1c9438d6a17ff76a5efedda689a444484', version: '3' },
  ],
  [
    'williamthorsen-comment-preferences',
    { bodyHash: '376461f9ea6c56c31ca85257cee96ac67659323449819eed303daa96a6ee91c2', version: '2' },
  ],
  [
    'williamthorsen-ticketing-preferences',
    { bodyHash: '233accc5a734488eb3e771d6434aa7820b7c04b8be34202f6aa06e1c35e56735', version: '1' },
  ],
  [
    'williamthorsen-tooling-preferences',
    { bodyHash: '642d02b4d962bd39a15e98b5118646eef36c1d4188261d87d2bebf9da2d3cec7', version: '1' },
  ],
  [
    'williamthorsen-typescript-preferences',
    { bodyHash: '80efabf4ff3943daaf8383ffe0d176a8a552579447042e988f11c84697a8f56b', version: '3' },
  ],
  [
    'williamthorsen-workflow-preferences',
    { bodyHash: 'f317cb5f34f7ea7e1234398d2dd716b218590b32025e445f6c766e4a3a6cdc50', version: '3' },
  ],
  [
    'williamthorsen-writing-preferences',
    { bodyHash: 'f01aba7eb7a1fa94bae7b8585061d8062b9722fa698676ad097d1bd672655afc', version: '3' },
  ],
]);

const DRIFT_MESSAGE =
  "A rulebook's deployed body no longer matches the pin recorded for it. Choose one remedy: bump the rulebook's " +
  "`version` and re-pin both fields where the operative content moved, so every repository's record re-opens its " +
  'coverage for review; or re-pin the hash alone where the edit left the operative content as it was. An edit to an ' +
  'included partial counts as an edit to the body, which is why a rulebook can drift with its own file untouched.';

const RESOLVED = resolveEveryRulebook();

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

/** Hashes a resolved rulebook's body, or the empty string where the slug resolved to nothing. */
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

/** Resolves every library rulebook by slug, each with its includes expanded and its frontmatter parsed off. */
async function resolveEveryRulebook(): Promise<ReadonlyMap<string, ResolvedRulebook>> {
  const resolver = libraryResolver(CONTENT_ROOT);
  const slugs = (await enumerateCatalogSlugs(CONTENT_ROOT)).rulebook;
  if (slugs === undefined || slugs.length === 0) {
    // Every assertion here reports what it finds, so an empty catalog would leave the whole suite green.
    throw new Error(`The catalog at ${CONTENT_ROOT} names no rulebook`);
  }

  return indexRulebooksBySlug(await Promise.all(slugs.map((slug) => resolveRulebook(slug, resolver))));
}

// endregion | Helpers
