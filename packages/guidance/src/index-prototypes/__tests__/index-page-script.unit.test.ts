import { Script } from 'node:vm';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { INDEX_PAGE_SCRIPT } from '../index-page-script.ts';
import { renderIndexPage } from '../render-index.ts';
import type { ManifestEntry } from '../types.ts';

type VerdictData = Record<string, unknown>;

const SLUGS = ['a', 'b', 'c'] as const;

describe('index page script', () => {
  it('renders verdicts in winner, rank, registration order with rejected last, ignoring stale slugs', async () => {
    const page = await openPage({
      verdicts: {
        a: { rejected: false, rank: 2, winner: false, updatedAt: '2026-10-03T02:00:00Z' },
        b: { rejected: false, rank: null, winner: true, updatedAt: '2026-10-03T02:00:00Z' },
        c: { rejected: true, rank: null, winner: false, updatedAt: '2026-10-03T02:00:00Z' },
        gone: { rejected: false, rank: 1, winner: true, updatedAt: '2026-10-03T03:00:00Z' },
      },
    });

    expect(page.order()).toEqual(['b', 'a', 'c']);
    expect(page.badges('b')).toEqual(['Winner']);
    expect(page.badges('a')).toEqual(['Rank 2']);
    expect(page.badges('c')).toEqual(['Rejected']);
    expect(page.text('#summary')).toBe('3 prototypes · winner: Prototype b · 1 ranked · 1 rejected');
  });

  it('treats the later of two winner claims as the winner', async () => {
    const page = await openPage({
      verdicts: {
        a: { winner: true, updatedAt: '2026-10-03T02:00:00Z' },
        c: { winner: true, updatedAt: '2026-10-03T02:00:01Z' },
      },
    });

    expect(page.order()[0]).toBe('c');
    expect(page.badges('a')).toEqual([]);
  });

  it('shows controls and the shortcut hint to a viewer whose write access is unknown', async () => {
    const page = await openPage({ canWrite: null });

    expect(page.controlsHidden()).toEqual([false, false, false]);
    expect(page.element('#shortcuts').hidden).toBe(false);
  });

  it('hides controls from a viewer who cannot write', async () => {
    const page = await openPage({ canWrite: false });

    expect(page.controlsHidden()).toEqual([true, true, true]);
    expect(page.element('#shortcuts').hidden).toBe(true);
    expect(page.text('#status')).toMatch(/not change them/);
  });

  it('renders the page without controls when db is unavailable', async () => {
    const page = await openPage({ db: false });

    expect(page.controlsHidden()).toEqual([true, true, true]);
    expect(page.text('#status')).toMatch(/not available in this view/);
    expect(page.text('#summary')).toBe('3 prototypes');
  });

  it('rejecting a prototype clears its rank and winner flag', async () => {
    const page = await openPage({ verdicts: { a: { rank: 1, winner: true, updatedAt: '2026-10-03T02:00:00Z' } } });

    page.click('a', 'reject');
    await settle();

    expect(page.store.writes).toEqual([
      { slug: 'a', data: expect.objectContaining({ rejected: true, rank: null, winner: false }) },
    ]);
    expect(page.order()).toEqual(['b', 'c', 'a']);
  });

  it('marks a new winner before clearing the previous one', async () => {
    const page = await openPage({ verdicts: { a: { winner: true, updatedAt: '2026-10-03T02:00:00Z' } } });

    page.click('b', 'winner');
    await settle();

    expect(page.store.writes.map(({ slug, data }) => [slug, data.winner])).toEqual([
      ['b', true],
      ['a', false],
    ]);
    expect(page.badges('b')).toEqual(['Winner']);
  });

  it('writes the rank chosen in the select', async () => {
    const page = await openPage({});

    page.selectRank('c', '2');
    await settle();

    expect(page.store.writes).toEqual([{ slug: 'c', data: expect.objectContaining({ rank: 2, rejected: false }) }]);
  });

  it('disables the controls with a message after a refused write', async () => {
    const page = await openPage({ canWrite: null, refuseWrites: true });

    page.click('a', 'reject');
    await settle();

    expect(page.text('#status')).toMatch(/cannot change verdicts/);
    expect(page.element('[data-slug="a"] [data-action="reject"]').hasAttribute('disabled')).toBe(true);
  });

  it('hides rejected prototypes when the toggle is cleared', async () => {
    const page = await openPage({ verdicts: { c: { rejected: true, updatedAt: '2026-10-03T02:00:00Z' } } });
    const toggle = page.element('#show-rejected');

    toggle.click();

    expect(page.element('[data-slug="c"]').hidden).toBe(true);
  });

  it('moves focus to the next card when a rejection hides the focused card', async () => {
    const page = await openPage({});
    page.element('#show-rejected').click();

    page.focus('a');
    page.press('x');
    await settle();

    expect(page.element('[data-slug="a"]').hidden).toBe(true);
    expect(page.focusedSlug()).toBe('b');
  });

  it('moves focus to the previous card when the hidden card was last', async () => {
    const page = await openPage({});
    page.element('#show-rejected').click();

    page.focus('c');
    page.press('x');
    await settle();

    expect(page.focusedSlug()).toBe('b');
  });

  it('moves between cards with the arrow keys, by one card across and one row down', async () => {
    const page = await openPage({});
    page.layOutRows([['a', 'b'], ['c']]);

    page.focus('a');
    page.press('ArrowRight');
    expect(page.focusedSlug()).toBe('b');
    page.press('ArrowRight');
    expect(page.focusedSlug()).toBe('c');
    page.press('ArrowUp');
    expect(page.focusedSlug()).toBe('a');
    page.press('ArrowLeft');
    expect(page.focusedSlug()).toBe('a');
    page.press('ArrowDown');
    expect(page.focusedSlug()).toBe('c');
  });

  it('leaves arrow keys alone unless a card itself has focus', async () => {
    const page = await openPage({});

    expect(page.press('ArrowDown')).toBe(true);
    expect(page.focusedSlug()).toBeUndefined();
    page.element('[data-slug="a"] [data-action="reject"]').focus();
    expect(page.press('ArrowRight')).toBe(true);
    expect(page.element('[data-slug="a"] [data-action="reject"]')).toBe(page.activeElement());
  });

  it('binds x, w, and digits on a focused card to verdicts', async () => {
    const page = await openPage({});

    page.focus('a');
    page.press('x');
    await settle();
    page.focus('b');
    page.press('3');
    await settle();
    page.press('w');
    await settle();

    expect(page.store.writes.map(({ slug, data }) => [slug, data.rejected, data.rank, data.winner])).toEqual([
      ['a', true, null, false],
      ['b', false, 3, false],
      ['b', false, 3, true],
    ]);
  });

  it('ignores shortcut keys typed into the rank select', async () => {
    const page = await openPage({});

    page.element('[data-slug="a"] select').focus();
    page.press('x');
    await settle();

    expect(page.store.writes).toEqual([]);
  });
});

// region | Helpers

/** Builds a manifest entry registered `minute` minutes past the hour. */
function buildEntry(slug: string, minute: number): ManifestEntry {
  return {
    slug,
    version: 1,
    registeredAt: `2026-10-03T01:${String(minute).padStart(2, '0')}:00.000Z`,
    title: `Prototype ${slug}`,
    url: `https://claude.ai/artifact/${slug}`,
    source: null,
    lens: null,
    inputs: [],
    description: null,
    shot: null,
  };
}

/** Builds an in-memory `verdicts` collection that delivers a snapshot after every write, as the platform does. */
function createStore(initial: Record<string, VerdictData>, refuseWrites: boolean) {
  const docs = new Map(Object.entries(initial));
  const listeners = new Set<(snapshot: unknown) => void>();
  const writes: { slug: string; data: VerdictData }[] = [];
  const emit = (): void => {
    const snapshot = { docs: [...docs].map(([id, data]) => ({ id, exists: true, data: () => data })) };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };
  const db = {
    collection: (name: string) => {
      if (name !== 'verdicts') {
        throw new Error(`unexpected collection ${name}`);
      }
      return {
        onSnapshot: (next: (snapshot: unknown) => void) => {
          listeners.add(next);
          setTimeout(emit, 0);
          return () => listeners.delete(next);
        },
        doc: (slug: string) => ({
          set: async (data: VerdictData) => {
            await Promise.resolve();
            if (refuseWrites) {
              throw Object.assign(new Error('refused'), { code: 'invalid_argument' });
            }
            writes.push({ slug, data });
            docs.set(slug, data);
            emit();
          },
        }),
      };
    },
  };
  return { db, writes };
}

/** Renders a three-prototype index into a JSDOM window with a fake `claude.use`, runs the page script, and settles. */
async function openPage(options: {
  verdicts?: Record<string, VerdictData>;
  canWrite?: boolean | null;
  db?: boolean;
  refuseWrites?: boolean;
}) {
  const html = renderIndexPage({
    title: 'Set',
    cards: SLUGS.map((slug, index) => ({ entry: buildEntry(slug, index), shot: null })),
  });
  const body = html.slice(html.indexOf('<main>'), html.indexOf('<script>'));
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { runScripts: 'outside-only' });
  const { window } = dom;
  const store = createStore(options.verdicts ?? {}, options.refuseWrites ?? false);
  const user = { can: () => Promise.resolve(options.canWrite === undefined ? true : options.canWrite) };
  Object.assign(window, {
    claude: {
      use: (name: string) => {
        if (name === 'db') return Promise.resolve(options.db === false ? null : store.db);
        if (name === 'user') return Promise.resolve(user);
        return Promise.resolve(null);
      },
    },
  });
  new Script(INDEX_PAGE_SCRIPT).runInContext(dom.getInternalVMContext());
  await settle();

  const element = (selector: string) => {
    const found = window.document.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new Error(`no element matches ${selector}`);
    }
    return found;
  };
  const cards = () => [...window.document.querySelectorAll<HTMLElement>('.card')];
  return {
    store,
    element,
    text: (selector: string) => element(selector).textContent,
    order: () => cards().map((card) => card.dataset.slug),
    badges: (slug: string) =>
      [...element(`[data-slug="${slug}"] [data-role="badges"]`).children].map((badge) => badge.textContent),
    controlsHidden: () => cards().map((card) => card.querySelector<HTMLElement>('[data-role="controls"]')?.hidden),
    click: (slug: string, action: string) => element(`[data-slug="${slug}"] [data-action="${action}"]`).click(),
    selectRank: (slug: string, value: string) => {
      const select = element(`[data-slug="${slug}"] select`);
      Object.assign(select, { value });
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    focus: (slug: string) => element(`[data-slug="${slug}"]`).focus(),
    focusedSlug: () => window.document.activeElement?.closest<HTMLElement>('.card')?.dataset.slug,
    activeElement: () => window.document.activeElement,
    // JSDOM does not lay out, so each card reports the top edge of the row that it is assigned to.
    layOutRows: (rows: string[][]) => {
      for (const [rowIndex, row] of rows.entries()) {
        for (const slug of row) {
          Object.defineProperty(element(`[data-slug="${slug}"]`), 'offsetTop', { value: rowIndex * 400 });
        }
      }
    },
    // Returns false when the page handled the key and suppressed its default action.
    press: (key: string) => {
      const target = window.document.activeElement ?? window.document.body;
      return target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    },
  };
}

/** Lets pending promise callbacks and zero-delay timers run. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// endregion | Helpers
