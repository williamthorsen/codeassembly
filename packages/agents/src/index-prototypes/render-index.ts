import { INDEX_PAGE_SCRIPT } from './index-page-script.ts';
import { renderTokenDeclarations } from './tokens.ts';
import type { ManifestEntry } from './types.ts';

/** A page size above which `render` warns that the page is approaching the artifact cap. */
export const PAGE_WARN_BYTES = 12_000_000;

/** The artifact page cap, above which `render` refuses to write the page. */
export const PAGE_LIMIT_BYTES = 16_000_000;

/** One card's input: the latest registration of a slug and its screenshot bytes, if any. */
export interface IndexCard {
  entry: ManifestEntry;
  shot: Buffer | null;
}

/**
 * Renders the index page as Artifact page content: the `<title>` and `<style>` first, without a document wrapper,
 * which the Artifact tool adds at publish time.
 */
export function renderIndexPage(input: { title: string; cards: readonly IndexCard[] }): string {
  const title = escapeHtml(input.title);
  const count = input.cards.length;
  return [
    `<title>${title}</title>`,
    `<style>${renderStyles()}</style>`,
    '<main>',
    '<header>',
    `<h1>${title}</h1>`,
    `<p class="summary" id="summary">${count} ${count === 1 ? 'prototype' : 'prototypes'}</p>`,
    '</header>',
    '<div class="toolbar">',
    '<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>',
    '<p class="hint" id="shortcuts" hidden>Keys: <kbd>j</kbd> / <kbd>k</kbd> move between cards · <kbd>x</kbd> reject · <kbd>w</kbd> winner · <kbd>1–9</kbd> rank</p>',
    '<p class="status" id="status" role="status" aria-live="polite"></p>',
    '</div>',
    '<div class="grid" id="grid">',
    ...input.cards.map((card) => renderCard(card, count)),
    '</div>',
    '</main>',
    `<script>${INDEX_PAGE_SCRIPT}</script>`,
    '',
  ].join('\n');
}

// region | Helpers

/** Escapes text for use in HTML content and double-quoted attribute values. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Formats an ISO-8601 timestamp as `YYYY-MM-DD HH:MM UTC`, returning an unparseable value as given. */
function formatTimestamp(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return iso;
  }
  const normalized = new Date(time).toISOString();
  return `${normalized.slice(0, 10)} ${normalized.slice(11, 16)} UTC`;
}

/** Renders one prototype's card, with its verdict controls hidden until the page script reveals them. */
function renderCard(card: IndexCard, count: number): string {
  const { entry } = card;
  const slug = escapeHtml(entry.slug);
  const title = escapeHtml(entry.title);
  const url = escapeHtml(entry.url);
  const titleId = `title-${slug}`;
  const thumbnail =
    card.shot === null
      ? `<span class="placeholder">No screenshot for v${entry.version}</span>`
      : `<img src="data:image/png;base64,${card.shot.toString('base64')}" alt="Screenshot of ${title}">`;
  const chips = [
    ...(entry.lens === null ? [] : [`<li class="chip">Lens: ${escapeHtml(entry.lens)}</li>`]),
    ...entry.inputs.map((input) => `<li class="chip">${escapeHtml(input)}</li>`),
  ];
  const rankOptions = Array.from({ length: count }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`);

  return [
    `<article class="card" tabindex="0" aria-labelledby="${titleId}" data-slug="${slug}" data-title="${title}" data-registered="${escapeHtml(entry.registeredAt)}">`,
    `<a class="thumb" href="${url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumbnail}</a>`,
    '<div class="body">',
    '<div class="badges" data-role="badges"></div>',
    `<h2 id="${titleId}"><a href="${url}" target="_blank" rel="noopener">${title}</a></h2>`,
    `<p class="meta">${slug} · v${entry.version} · ${escapeHtml(formatTimestamp(entry.registeredAt))}</p>`,
    ...(chips.length === 0 ? [] : [`<ul class="chips">${chips.join('')}</ul>`]),
    ...(entry.description === null ? [] : [`<p class="description">${escapeHtml(entry.description)}</p>`]),
    '<div class="controls" data-role="controls" hidden>',
    `<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${titleId}">Reject</button>`,
    `<label class="rank">Rank <select data-action="rank" aria-describedby="${titleId}"><option value="">None</option>${rankOptions.join('')}</select></label>`,
    `<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${titleId}">Winner</button>`,
    '</div>',
    '</div>',
    '</article>',
  ].join('\n');
}

/** Renders the page's stylesheet: the theme tokens in the three-state shape, then the layout. */
function renderStyles(): string {
  return `
:root { color-scheme: light; ${renderTokenDeclarations('light')} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${renderTokenDeclarations('dark')} }
}
:root[data-theme="dark"] { color-scheme: dark; ${renderTokenDeclarations('dark')} }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 24px; line-height: 1.25; margin: 0 0 4px; }
img { max-width: 100%; }
[hidden] { display: none !important; }
.summary, .hint, .status { margin: 0; color: var(--text-muted); font-size: 13px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; margin: 12px 0 20px; }
.toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
.toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
kbd { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); background: var(--chip); border-radius: 4px; padding: 0 4px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }
.card { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--control-border); border-radius: 10px; overflow: hidden; }
.card.is-winner { border: 3px solid var(--winner-border); }
.card:focus-visible, a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.thumb { display: block; aspect-ratio: 16 / 10; background: var(--chip); }
.thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.card.is-rejected .thumb img { opacity: 0.4; filter: grayscale(1); }
.placeholder { display: flex; align-items: center; justify-content: center; height: 100%; padding: 8px; color: var(--text-muted); font-size: 13px; }
.body { display: flex; flex: 1; flex-direction: column; gap: 6px; padding: 12px 14px 14px; }
.card h2 { margin: 0; font-size: 17px; line-height: 1.3; }
.card h2 a { color: var(--accent); }
.meta { margin: 0; color: var(--text-muted); font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.chip { padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--text); font-size: 13px; }
.description { margin: 0; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badges:empty { display: none; }
.badge { padding: 2px 8px; border-radius: 6px; background: var(--chip); color: var(--text); font-size: 13px; font-weight: 600; }
.badge.winner { background: var(--winner-bg); color: var(--winner-text); }
.badge.rejected { background: var(--reject-bg); color: var(--reject-text); }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; }
.rank { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
button, select { min-height: 32px; padding: 4px 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit; font-size: 14px; cursor: pointer; }
button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
button:disabled, select:disabled { cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
`;
}

// endregion | Helpers
