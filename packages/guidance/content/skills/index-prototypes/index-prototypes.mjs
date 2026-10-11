import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var J=Object.defineProperty;var s=(e,t)=>J(e,"name",{value:t,configurable:!0});import{realpathSync as G}from"node:fs";import{mkdir as we,readFile as ve,writeFile as ke}from"node:fs/promises";import v from"node:path";import g from"node:process";import{fileURLToPath as Se}from"node:url";function M(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}s(M,"isError");function y(e){try{return M(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}s(y,"describeError");function P(e,t){let r=[],n=[];for(let o=0;o<e.length;o+=1){let i=e[o];if(i===void 0)continue;if(!i.startsWith("--")){r.push(i);continue}let c=X(i,t);if(c===null)throw new Error(`unknown flag: ${i}`);let{spec:d,inlineValue:a}=c;if(!d.takesValue){if(a!==null)throw new Error(`--${d.name} does not take a value`);n.push({name:d.name,value:null});continue}if(a!==null){n.push({name:d.name,value:a});continue}let l=e[o+1]??null;if(l===null||l.startsWith("--"))throw new Error(`--${d.name} requires a value`);n.push({name:d.name,value:l}),o+=1}return{positionals:r,flags:n}}s(P,"scanFlags");function C(e){let t={};for(let{name:r,value:n}of e)n!==null&&(t[r]=n);return t}s(C,"valueFlagMap");function X(e,t){for(let r of t)for(let n of[r.name,...r.aliases??[]]){let o=`--${n}`;if(e===o)return{spec:r,inlineValue:null};if(e.startsWith(`${o}=`))return{spec:r,inlineValue:e.slice(o.length+1)}}return null}s(X,"matchFlag");function Q(e,t){return I(e)&&e.code===t}s(Q,"isErrorCode");function p(e){return Q(e,"ENOENT")}s(p,"isEnoent");function x(e){return I(e)&&!Array.isArray(e)}s(x,"isRecord");function I(e){return typeof e=="object"&&e!==null}s(I,"isObject");var T=String.raw`() => {
  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, legend, caption, figcaption, summary';
  const INLINE = 'label, button, a, option';
  const SKIPPED = '[data-demo], script, style, template';
  const MIN_WORDS = ${4};

  const entries = [];
  const byContainer = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const placeholder = node.getAttribute('placeholder');
      if (placeholder !== null && node.closest(SKIPPED) === null) {
        entries.push([placeholder]);
      }
      continue;
    }
    const parent = node.parentElement;
    if (parent === null || parent.closest(SKIPPED) !== null) {
      continue;
    }
    const nearest = parent.closest(BLOCK + ', div');
    const inline = parent.closest(INLINE);
    const container =
      nearest !== null && nearest.matches(BLOCK)
        ? nearest
        : inline !== null && (nearest === null || nearest.contains(inline))
          ? inline
          : (nearest ?? parent);
    let parts = byContainer.get(container);
    if (parts === undefined) {
      parts = [];
      byContainer.set(container, parts);
      entries.push(parts);
    }
    parts.push(node.data);
  }

  const seen = new Set();
  const strings = [];
  for (const parts of entries) {
    const text = parts.join('').replace(/\s+/g, ' ').trim();
    if (text === '' || text.split(' ').length < MIN_WORDS || seen.has(text)) {
      continue;
    }
    seen.add(text);
    strings.push(text);
  }
  return strings;
}`;import{copyFile as Z,mkdir as ee,readFile as te}from"node:fs/promises";import $ from"node:path";var O=Buffer.from([137,80,78,71,13,10,26,10]);async function _(e){let t;try{t=await te(e.sourcePath)}catch(o){if(p(o))return{ok:!1,error:"screenshot-not-found",message:`no screenshot at ${e.sourcePath}`};throw o}if(!t.subarray(0,O.length).equals(O))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=$.join("shots",`${e.slug}-v${e.version}.png`),n=$.join(e.setDir,r);return await ee($.dirname(n),{recursive:!0}),await Z(e.sourcePath,n),{ok:!0,shot:r}}s(_,"intakeScreenshot");import{mkdir as re,readFile as ne,rename as oe,rm as se,writeFile as ie}from"node:fs/promises";import L from"node:path";import ae from"node:process";var V="manifest.json",ce=/^[a-z0-9][a-z0-9-]{0,39}$/;function de(e){return x(e)?typeof e.shared=="string"&&w(e.changes)&&Array.isArray(e.try)&&e.try.every(t=>typeof t=="string"):!1}s(de,"isSetSummary");function F(e){return ce.test(e)}s(F,"isValidSlug");function W(e){let t=new Map;for(let r of e.entries){let n=t.get(r.slug);(n===void 0||r.version>n.version)&&t.set(r.slug,r)}return t.values().toArray()}s(W,"listLatestEntries");function q(e,t){let r=e?.entries??[],n=0;for(let o of r)o.slug===t&&o.version>n&&(n=o.version);return n+1}s(q,"nextVersion");function D(e,t){let r=e?.entries??[],n=0;for(let o of r){if(o.slug===t)return o.number;n=Math.max(n,o.number)}return n+1}s(D,"resolveNumber");async function S(e){let t=B(e),r;try{r=await ne(t,"utf8")}catch(o){if(p(o))return{kind:"missing"};throw o}let n;try{n=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return fe(n)?{kind:"ok",manifest:ge(n)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}s(S,"readManifest");function B(e){return L.join(e,V)}s(B,"resolveManifestPath");async function A(e,t){await re(e,{recursive:!0});let r=B(e),n=L.join(e,`.${V}.${ae.pid}.${Date.now()}.tmp`);try{await ie(n,`${JSON.stringify(t,null,2)}
`,"utf8"),await oe(n,r)}catch(o){throw await se(n,{force:!0}),o}return r}s(A,"writeManifest");function le(e){return x(e)&&typeof e.label=="string"&&typeof e.value=="string"}s(le,"isNote");function w(e){return e===null||typeof e=="string"}s(w,"isNullableString");function ue(e){return x(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&w(e.source)&&w(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&w(e.description)&&(e.notes===void 0||Array.isArray(e.notes)&&e.notes.every(t=>le(t)))&&w(e.shot):!1}s(ue,"isStoredEntry");function fe(e){return x(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&(e.summary===void 0||e.summary===null||de(e.summary))&&Array.isArray(e.entries)&&e.entries.every(t=>ue(t)):!1}s(fe,"isStoredManifest");function ge(e){let t=new Map;for(let o of e.entries){let i=t.get(o.slug);o.number!==void 0&&(i===void 0||o.version>i.version)&&t.set(o.slug,{version:o.version,number:o.number})}let r=new Map(t.entries().map(([o,{number:i}])=>[o,i])),n=Math.max(0,...r.values());for(let o of e.entries)r.has(o.slug)||(n+=1,r.set(o.slug,n));return{...e,summary:e.summary??null,entries:e.entries.map(o=>{let i=r.get(o.slug);if(i===void 0)throw new Error(`slug "${o.slug}" was not numbered`);return{...o,number:i,notes:o.notes??[]}})}}s(ge,"normalizeManifest");var pe="verdicts";var K=`(() => {
  'use strict';
  const COLLECTION = '${pe}';
  const grid = document.getElementById('grid');
  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const showRejected = document.getElementById('show-rejected');
  const rejectedToggle = document.getElementById('rejected-toggle');
  const shortcuts = document.getElementById('shortcuts');
  const cards = Array.from(grid.querySelectorAll('.card'));
  const bySlug = new Map(cards.map((card) => [card.dataset.slug, card]));
  const rankLimit = cards.length;
  const queues = new Map();
  const state = { db: null, writable: false, refused: false, verdicts: new Map() };

  function readVerdict(slug) {
    return state.verdicts.get(slug) || { rejected: false, rank: null, winner: false, updatedAt: '' };
  }

  function normalizeVerdict(data) {
    const rank = Number.isInteger(data.rank) && data.rank >= 1 && data.rank <= rankLimit ? data.rank : null;
    return {
      rejected: data.rejected === true,
      rank,
      winner: data.winner === true,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  // Two documents can claim the win between the two writes of a winner change; the later claim wins.
  function resolveWinner() {
    let winner = null;
    for (const [slug, verdict] of state.verdicts) {
      if (verdict.winner && !verdict.rejected && (winner === null || verdict.updatedAt > winner.updatedAt)) {
        winner = { slug, updatedAt: verdict.updatedAt };
      }
    }
    return winner === null ? null : winner.slug;
  }

  function buildSortKey(card, winner) {
    const slug = card.dataset.slug;
    const verdict = readVerdict(slug);
    let group = 2;
    if (verdict.rejected) group = 3;
    else if (slug === winner) group = 0;
    else if (verdict.rank !== null) group = 1;
    return [group, verdict.rank === null ? 0 : verdict.rank, card.dataset.registered];
  }

  function compareKeys(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function renderBadges(card, verdict, isWinner) {
    const badges = card.querySelector('[data-role="badges"]');
    badges.replaceChildren();
    const add = (text, variant) => {
      const badge = document.createElement('span');
      badge.className = 'badge' + (variant ? ' ' + variant : '');
      badge.textContent = text;
      badges.append(badge);
    };
    if (isWinner) add('Winner', 'winner');
    if (verdict.rank !== null) add('Rank ' + verdict.rank, '');
    if (verdict.rejected) add('Rejected', 'rejected');
  }

  function render() {
    const winner = resolveWinner();
    const focused = document.activeElement;
    const shownOrder = Array.from(grid.children);
    const sorted = cards.slice().sort((left, right) => compareKeys(buildSortKey(left, winner), buildSortKey(right, winner)));
    for (const card of sorted) grid.append(card);
    if (focused instanceof HTMLElement && focused !== document.activeElement && grid.contains(focused)) {
      focused.focus({ preventScroll: true });
    }

    const showControls = state.db !== null && state.writable;
    let rejectedCount = 0;
    let rankedCount = 0;
    for (const card of cards) {
      const slug = card.dataset.slug;
      const verdict = readVerdict(slug);
      const isWinner = slug === winner;
      if (verdict.rejected) rejectedCount += 1;
      if (verdict.rank !== null && !verdict.rejected) rankedCount += 1;
      card.classList.toggle('is-winner', isWinner);
      card.classList.toggle('is-rejected', verdict.rejected);
      card.hidden = verdict.rejected && !showRejected.checked;
      renderBadges(card, verdict, isWinner);

      const controls = card.querySelector('[data-role="controls"]');
      controls.hidden = !showControls;
      for (const control of controls.querySelectorAll('button, select')) control.disabled = state.refused;
      controls.querySelector('[data-action="reject"]').setAttribute('aria-pressed', String(verdict.rejected));
      controls.querySelector('[data-action="winner"]').setAttribute('aria-pressed', String(isWinner));
      controls.querySelector('[data-action="rank"]').value = verdict.rank === null ? '' : String(verdict.rank);
    }

    // Keep keyboard focus where the viewer was when a verdict hides the focused card: on its neighbor in the order
    // shown before this render.
    const focusedCard = focused instanceof Element ? focused.closest('.card') : null;
    if (focusedCard && focusedCard.hidden) {
      const index = shownOrder.indexOf(focusedCard);
      const neighbor =
        shownOrder.slice(index + 1).find((card) => !card.hidden) ||
        shownOrder.slice(0, index).reverse().find((card) => !card.hidden);
      if (neighbor) neighbor.focus({ preventScroll: true });
    }

    const parts = [cards.length + (cards.length === 1 ? ' prototype' : ' prototypes')];
    if (state.db !== null) {
      const winnerCard = winner === null ? null : bySlug.get(winner);
      parts.push(winnerCard ? 'winner: ' + winnerCard.dataset.number + '. ' + winnerCard.dataset.title : 'no winner yet');
      parts.push(rankedCount + ' ranked', rejectedCount + ' rejected');
    }
    summary.textContent = parts.join(' \xB7 ');
  }

  function canAct() {
    return state.db !== null && state.writable && !state.refused;
  }

  function writeVerdict(slug, verdict) {
    const previous = queues.get(slug) || Promise.resolve();
    const next = previous.then(() => state.db.collection(COLLECTION).doc(slug).set(verdict));
    queues.set(slug, next.catch(() => undefined));
    return next;
  }

  function handleWriteError(error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') {
      state.refused = true;
      setStatus('This view cannot change verdicts, so they are shown read-only.');
    } else if (code === 'quota_exceeded') {
      setStatus('The verdict store is full, so this verdict was not saved.');
    } else {
      setStatus('The verdict was not saved. Try again in a moment.');
    }
    render();
  }

  async function applyVerdict(slug, patch) {
    const verdict = Object.assign({}, readVerdict(slug), patch, { updatedAt: new Date().toISOString() });
    try {
      await writeVerdict(slug, verdict);
      return true;
    } catch (error) {
      handleWriteError(error);
      return false;
    }
  }

  async function toggleReject(slug) {
    if (!canAct()) return;
    const verdict = readVerdict(slug);
    await applyVerdict(slug, verdict.rejected ? { rejected: false } : { rejected: true, rank: null, winner: false });
  }

  async function setRank(slug, rank) {
    if (!canAct()) return;
    await applyVerdict(slug, { rank, rejected: false });
  }

  async function toggleWinner(slug) {
    if (!canAct()) return;
    if (resolveWinner() === slug) {
      await applyVerdict(slug, { winner: false });
      return;
    }
    if (!(await applyVerdict(slug, { winner: true, rejected: false }))) return;
    for (const [other, verdict] of state.verdicts) {
      if (other !== slug && verdict.winner) await applyVerdict(other, { winner: false });
    }
  }

  // A row is the run of visible cards that share the first card's top edge.
  function countColumns(visible) {
    const top = visible[0].offsetTop;
    return Math.max(1, visible.filter((card) => card.offsetTop === top).length);
  }

  function moveFocus(card, key) {
    const visible = Array.from(grid.querySelectorAll('.card')).filter((candidate) => !candidate.hidden);
    const index = visible.indexOf(card);
    if (index === -1) return;
    const columns = countColumns(visible);
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const target = visible[index + steps[key]];
    if (target) target.focus();
  }

  grid.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    const slug = button.closest('.card').dataset.slug;
    if (button.dataset.action === 'reject') void toggleReject(slug);
    if (button.dataset.action === 'winner') void toggleWinner(slug);
  });

  grid.addEventListener('change', (event) => {
    const select = event.target instanceof Element ? event.target.closest('select[data-action="rank"]') : null;
    if (!select) return;
    void setRank(select.closest('.card').dataset.slug, select.value === '' ? null : Number(select.value));
  });

  showRejected.addEventListener('change', render);

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('input, select, textarea, [contenteditable]')) return;
    const card = target ? target.closest('.card') : null;
    const key = event.key;
    if (key.startsWith('Arrow')) {
      // Arrows move between cards only from a focused card, so the page scrolls as usual elsewhere.
      if (!event.shiftKey && target && target.classList.contains('card')) {
        event.preventDefault();
        moveFocus(target, key);
      }
      return;
    }
    if (!card || !canAct()) return;
    const slug = card.dataset.slug;
    if (key === 'x') void toggleReject(slug);
    else if (key === 'w') void toggleWinner(slug);
    else if (/^[1-9]$/.test(key) && Number(key) <= rankLimit) void setRank(slug, Number(key));
    else return;
    event.preventDefault();
  });

  async function connect() {
    const claude = window.claude;
    if (!claude || typeof claude.use !== 'function') {
      setStatus('Verdicts are available only in the Claude viewer.');
      return;
    }
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db) {
      setStatus('Verdicts are not available in this view.');
      return;
    }
    state.db = db;
    const canWrite = user ? await user.can('data.write') : null;
    state.writable = canWrite !== false;
    rejectedToggle.hidden = false;
    shortcuts.hidden = !state.writable;
    if (!state.writable) setStatus('You can see the verdicts but not change them.');
    db.collection(COLLECTION).onSnapshot(
      (snapshot) => {
        const verdicts = new Map();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (bySlug.has(doc.id) && data) verdicts.set(doc.id, normalizeVerdict(data));
        }
        state.verdicts = verdicts;
        render();
      },
      () => setStatus('Verdicts stopped updating. Reload the page to see the latest.'),
    );
    render();
  }

  render();
  connect().catch(() => setStatus('Verdicts could not be loaded.'));
})();
`;var me=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],he={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function E(e){return me.map(t=>`--${t}: ${he[e][t]};`).join(" ")}s(E,"renderTokenDeclarations");var z=12e6,N=16e6;function U(e){let t=f(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${xe()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(n=>ye(n,r)),"</div>","</main>",`<script>${K}</script>`,""].join(`
`)}s(U,"renderIndexPage");function f(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}s(f,"escapeHtml");function be(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}s(be,"formatTimestamp");function ye(e,t){let{entry:r}=e,n=f(r.slug),o=f(r.title),i=f(r.url),c=`title-${n}`,d=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${o}">`,a=[...r.lens===null?[]:[`<li class="chip">Lens: ${f(r.lens)}</li>`],...r.inputs.map(h=>`<li class="chip">${f(h)}</li>`)],l=Array.from({length:t},(h,b)=>`<option value="${b+1}">${b+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${c}" data-slug="${n}" data-number="${r.number}" data-title="${o}" data-registered="${f(r.registeredAt)}">`,`<a class="thumb" href="${i}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${d}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${c}"><a href="${i}" target="_blank" rel="noopener">${r.number}. ${o}</a></h2>`,`<p class="meta">${n} \xB7 v${r.version} \xB7 ${f(be(r.registeredAt))}</p>`,...a.length===0?[]:[`<ul class="chips">${a.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${f(r.description)}</p>`],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${c}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${c}"><option value="">None</option>${l.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${c}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}s(ye,"renderCard");function xe(){return`
:root { color-scheme: light; ${E("light")} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${E("dark")} }
}
:root[data-theme="dark"] { color-scheme: dark; ${E("dark")} }
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
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(480px, 100%), 1fr)); }
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
`}s(xe,"renderStyles");var R=["copy-probe","record-index","register","render"],Ee=new Set(R),Ne=[{name:"description",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],$e={"copy-probe":{required:[],optional:[]},"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]}};async function Ae(){try{let e=await je({argv:g.argv.slice(2),now:new Date});g.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(g.exitCode=1)}catch(e){g.stderr.write(`index-prototypes: ${y(e)}
`),g.exit(1)}}s(Ae,"main");Pe()&&await Ae();async function je(e){let t;try{t=Re(e.argv)}catch(r){return u("invalid-args",y(r))}switch(t.command){case"copy-probe":return{ok:!0,command:"copy-probe",function:T};case"record-index":return Te(j(t.values),m(t.values,"url"));case"register":return Oe(j(t.values),t.values,e.now);case"render":return _e(j(t.values),v.resolve(m(t.values,"out")));default:{let r=t.command;throw new Error(`unhandled command: ${String(r)}`)}}}s(je,"runIndexPrototypes");function Re(e){let{positionals:t,flags:r}=P(e,Ne),[n,o]=t;if(n===void 0)throw new Error(`a command is required: ${R.join(", ")}`);if(!Me(n))throw new Error(`unknown command "${n}"; expected one of ${R.join(", ")}`);if(o!==void 0)throw new Error(`unexpected argument: ${o}`);let i=C(r),{required:c,optional:d}=$e[n];for(let[a,l]of Object.entries(i)){if(!c.includes(a)&&!d.includes(a))throw new Error(`${n} does not take --${a}`);if(l==="")throw new Error(`--${a} requires a value`)}for(let a of c)if(i[a]===void 0)throw new Error(`${n} requires --${a}`);return{command:n,values:i}}s(Re,"parseArgs");function u(e,t){return{ok:!1,error:e,message:t}}s(u,"fail");function Me(e){return Ee.has(e)}s(Me,"isCommand");function Pe(){let e=g.argv[1];if(e===void 0)return!1;try{return G(Se(import.meta.url))===G(e)}catch(t){return g.stderr.write(`index-prototypes: warning: could not determine entry point: ${y(t)}
`),!1}}s(Pe,"isEntryPoint");function Y(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}s(Y,"isWebUrl");function Ce(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}s(Ce,"parseInputs");async function Ie(e){try{return await ve(e)}catch(t){if(p(t))return null;throw t}}s(Ie,"readShot");async function Te(e,t){if(!Y(t))return u("invalid-url",`--url "${t}" is not an http or https URL`);let r=await S(e);return r.kind==="missing"?u("manifest-not-found",`no manifest in ${e}; register a prototype first`):r.kind==="invalid"?u("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await A(e,{...r.manifest,indexUrl:t}),indexUrl:t}}s(Te,"recordIndex");async function Oe(e,t,r){let n=m(t,"slug");if(!F(n))return u("invalid-slug",`slug "${n}" must match [a-z0-9][a-z0-9-]{0,39}`);let o=m(t,"url");if(!Y(o))return u("invalid-url",`--url "${o}" is not an http or https URL`);let i=await S(e);if(i.kind==="invalid")return u("invalid-manifest",i.message);let c=i.kind==="ok"?i.manifest:null,d=t["set-title"]??c?.title;if(d===void 0)return u("missing-set-title","the first registration in a set requires --set-title");let a=q(c,n),l=null,h=t.screenshot;if(h!==void 0){let k=await _({sourcePath:v.resolve(h),setDir:e,slug:n,version:a});if(!k.ok)return u(k.error,k.message);l=k.shot}let b={slug:n,number:D(c,n),version:a,registeredAt:r.toISOString(),title:m(t,"title"),url:o,source:t.source??null,lens:t.lens??null,inputs:Ce(t.inputs),description:t.description??null,notes:[],shot:l},H={title:d,indexUrl:c?.indexUrl??null,summary:c?.summary??null,entries:[...c?.entries??[],b]};return{ok:!0,command:"register",manifestPath:await A(e,H),entry:b}}s(Oe,"register");async function _e(e,t){let r=await S(e);if(r.kind==="missing")return u("manifest-not-found",`no manifest in ${e}; register a prototype first`);if(r.kind==="invalid")return u("invalid-manifest",r.message);let{manifest:n}=r,o=[],i=[];for(let a of W(n)){let l=a.shot===null?null:await Ie(v.join(e,a.shot));a.shot!==null&&l===null&&i.push(a.slug),o.push({entry:a,shot:l})}let c=U({title:n.title,cards:o}),d=Buffer.byteLength(c,"utf8");return d>N?u("page-too-large",`the page is ${d} bytes, over the ${N}-byte artifact cap`):(await we(v.dirname(t),{recursive:!0}),await ke(t,c,"utf8"),{ok:!0,command:"render",path:t,bytes:d,cards:o.length,title:n.title,indexUrl:n.indexUrl,missingShots:i,...d>z&&{warning:`the page is ${d} bytes, approaching the ${N}-byte artifact cap`}})}s(_e,"render");function m(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}s(m,"requireFlag");function j(e){return v.resolve(m(e,"set-dir"))}s(j,"resolveSetDir");export{Re as parseArgs,je as runIndexPrototypes};
