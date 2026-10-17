import { listCatalog } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { readFrontmatterList } from '../test-utils/read-frontmatter-list.ts';

// An ambient rulebook is loaded by every session that declares it, so each one makes every such session's context
// larger. A pin puts the choice of ambient delivery into the reviewed diff, together with the reason that it clears
// the bar.

/** Every library rulebook allowed ambient delivery, with the reason that nearly every session needs its content. */
const AMBIENT_PINS = new Map<string, string>([
  ['command-output-conventions', 'Every session runs commands whose output stays in its context.'],
  [
    'generated-content-policy',
    'Any session may edit a deployed file, and the body is a short trigger that points to a reference.',
  ],
  [
    'live-worktree-policy',
    'Any session may write to a repo that deploys from `live`, and a write through `.live` changes the deployed tree.',
  ],
  ['williamthorsen-collaboration-preferences', 'Governs every interactive turn.'],
  ['williamthorsen-comment-preferences', 'Nearly every session writes or edits source.'],
  [
    'williamthorsen-subagent-model-preferences',
    'Any session may dispatch a subagent, and the moment of dispatch gives no cue to consult a skill.',
  ],
  ['williamthorsen-tooling-preferences', 'Every session runs shell commands.'],
  ['williamthorsen-workflow-preferences', 'Governs how every session handles questions, tickets, branches, and scope.'],
  ['williamthorsen-writing-preferences', 'Every reply is prose.'],
]);

const UNPINNED_MESSAGE =
  'A rulebook declares ambient delivery without a pin. Ambient delivery is for content that nearly every session ' +
  'needs. If this rulebook clears that bar, add it to `AMBIENT_PINS` with the reason; otherwise, deliver it as ' +
  '`skill` or `hook`:';

const AMBIENT_SLUGS = listAmbientRulebooks();

describe('ambient delivery pins', () => {
  it('pins every ambient rulebook', async () => {
    const unpinned = (await AMBIENT_SLUGS).filter((slug) => !AMBIENT_PINS.has(slug));

    expect(unpinned, `${UNPINNED_MESSAGE}\n  ${unpinned.join('\n  ')}`).toEqual([]);
  });

  it('pins only ambient rulebooks', async () => {
    const ambient = new Set(await AMBIENT_SLUGS);
    const orphaned = AMBIENT_PINS.keys()
      .filter((slug) => !ambient.has(slug))
      .toArray();

    const message = `A pin names a rulebook that is gone or that does not declare ambient delivery: ${orphaned.join(', ')}`;
    expect(orphaned, message).toEqual([]);
  });

  it('gives every pin a reason', () => {
    const unexplained = [...AMBIENT_PINS].filter(([, reason]) => reason.trim() === '').map(([slug]) => slug);

    expect(unexplained, `A pin does not state its reason: ${unexplained.join(', ')}`).toEqual([]);
  });
});

// region | Helpers

/** Lists the library rulebooks whose `delivery` includes `ambient`, whatever other routes it names. */
async function listAmbientRulebooks(): Promise<ReadonlyArray<string>> {
  const slugs = (await listCatalog(CONTENT_ROOT)).rulebook;
  if (slugs.length === 0) {
    // A suite that reports what it finds would stay green over an empty catalog.
    throw new Error(`The catalog at ${CONTENT_ROOT} doesn't name any rulebook`);
  }

  const deliveries = await Promise.all(
    slugs.map(async (slug) => ({ slug, delivery: await readFrontmatterList('rulebook', slug, 'delivery') })),
  );
  return deliveries.filter(({ delivery }) => delivery.includes('ambient')).map(({ slug }) => slug);
}

// endregion | Helpers
