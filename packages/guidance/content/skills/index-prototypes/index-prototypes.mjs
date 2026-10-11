import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var X=Object.defineProperty;var s=(e,t)=>X(e,"name",{value:t,configurable:!0});import{realpathSync as Y}from"node:fs";import{mkdir as ve,readFile as ke,writeFile as Se}from"node:fs/promises";import v from"node:path";import m from"node:process";import{fileURLToPath as Ee}from"node:url";function P(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}s(P,"isError");function y(e){try{return P(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}s(y,"describeError");function C(e,t){let r=[],n=[];for(let o=0;o<e.length;o+=1){let i=e[o];if(i===void 0)continue;if(!i.startsWith("--")){r.push(i);continue}let c=Q(i,t);if(c===null)throw new Error(`unknown flag: ${i}`);let{spec:a,inlineValue:l}=c;if(!a.takesValue){if(l!==null)throw new Error(`--${a.name} does not take a value`);n.push({name:a.name,value:null});continue}if(l!==null){n.push({name:a.name,value:l});continue}let u=e[o+1]??null;if(u===null||u.startsWith("--"))throw new Error(`--${a.name} requires a value`);n.push({name:a.name,value:u}),o+=1}return{positionals:r,flags:n}}s(C,"scanFlags");function I(e){let t={};for(let{name:r,value:n}of e)n!==null&&(t[r]=n);return t}s(I,"valueFlagMap");function Q(e,t){for(let r of t)for(let n of[r.name,...r.aliases??[]]){let o=`--${n}`;if(e===o)return{spec:r,inlineValue:null};if(e.startsWith(`${o}=`))return{spec:r,inlineValue:e.slice(o.length+1)}}return null}s(Q,"matchFlag");function Z(e,t){return T(e)&&e.code===t}s(Z,"isErrorCode");function h(e){return Z(e,"ENOENT")}s(h,"isEnoent");function x(e){return T(e)&&!Array.isArray(e)}s(x,"isRecord");function T(e){return typeof e=="object"&&e!==null}s(T,"isObject");var O=String.raw`() => {
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
}`;import{copyFile as ee,mkdir as te,readFile as re}from"node:fs/promises";import $ from"node:path";var _=Buffer.from([137,80,78,71,13,10,26,10]);async function V(e){let t;try{t=await re(e.sourcePath)}catch(o){if(h(o))return{ok:!1,error:"screenshot-not-found",message:`no screenshot at ${e.sourcePath}`};throw o}if(!t.subarray(0,_.length).equals(_))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=$.join("shots",`${e.slug}-v${e.version}.png`),n=$.join(e.setDir,r);return await te($.dirname(n),{recursive:!0}),await ee(e.sourcePath,n),{ok:!0,shot:r}}s(V,"intakeScreenshot");import{mkdir as ne,readFile as oe,rename as se,rm as ie,writeFile as ae}from"node:fs/promises";import L from"node:path";import ce from"node:process";var F="manifest.json",de=/^[a-z0-9][a-z0-9-]{0,39}$/;function le(e){return x(e)?typeof e.shared=="string"&&w(e.changes)&&Array.isArray(e.try)&&e.try.every(t=>typeof t=="string"):!1}s(le,"isSetSummary");function W(e){return de.test(e)}s(W,"isValidSlug");function q(e){let t=new Map;for(let r of e.entries){let n=t.get(r.slug);(n===void 0||r.version>n.version)&&t.set(r.slug,r)}return t.values().toArray()}s(q,"listLatestEntries");function D(e,t){let r=e?.entries??[],n=0;for(let o of r)o.slug===t&&o.version>n&&(n=o.version);return n+1}s(D,"nextVersion");function B(e,t){let r=e?.entries??[],n=0;for(let o of r){if(o.slug===t)return o.number;n=Math.max(n,o.number)}return n+1}s(B,"resolveNumber");async function S(e){let t=K(e),r;try{r=await oe(t,"utf8")}catch(o){if(h(o))return{kind:"missing"};throw o}let n;try{n=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return ge(n)?{kind:"ok",manifest:pe(n)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}s(S,"readManifest");function K(e){return L.join(e,F)}s(K,"resolveManifestPath");async function A(e,t){await ne(e,{recursive:!0});let r=K(e),n=L.join(e,`.${F}.${ce.pid}.${Date.now()}.tmp`);try{await ae(n,`${JSON.stringify(t,null,2)}
`,"utf8"),await se(n,r)}catch(o){throw await ie(n,{force:!0}),o}return r}s(A,"writeManifest");function ue(e){return x(e)&&typeof e.label=="string"&&typeof e.value=="string"}s(ue,"isNote");function w(e){return e===null||typeof e=="string"}s(w,"isNullableString");function fe(e){return x(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&w(e.source)&&w(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&w(e.description)&&(e.notes===void 0||Array.isArray(e.notes)&&e.notes.every(t=>ue(t)))&&w(e.shot):!1}s(fe,"isStoredEntry");function ge(e){return x(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&(e.summary===void 0||e.summary===null||le(e.summary))&&Array.isArray(e.entries)&&e.entries.every(t=>fe(t)):!1}s(ge,"isStoredManifest");function pe(e){let t=new Map;for(let o of e.entries){let i=t.get(o.slug);o.number!==void 0&&(i===void 0||o.version>i.version)&&t.set(o.slug,{version:o.version,number:o.number})}let r=new Map(t.entries().map(([o,{number:i}])=>[o,i])),n=Math.max(0,...r.values());for(let o of e.entries)r.has(o.slug)||(n+=1,r.set(o.slug,n));return{...e,summary:e.summary??null,entries:e.entries.map(o=>{let i=r.get(o.slug);if(i===void 0)throw new Error(`slug "${o.slug}" was not numbered`);return{...o,number:i,notes:o.notes??[]}})}}s(pe,"normalizeManifest");var me="verdicts";var z=`(() => {
  'use strict';
  const COLLECTION = '${me}';
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
`;var he=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],be={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function E(e){return he.map(t=>`--${t}: ${be[e][t]};`).join(" ")}s(E,"renderTokenDeclarations");var U=12e6,N=16e6;function G(e){let t=g(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${we()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(n=>xe(n,r)),"</div>","</main>",`<script>${z}</script>`,""].join(`
`)}s(G,"renderIndexPage");function g(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}s(g,"escapeHtml");function ye(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}s(ye,"formatTimestamp");function xe(e,t){let{entry:r}=e,n=g(r.slug),o=g(r.title),i=g(r.url),c=`title-${n}`,a=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${o}">`,l=[...r.lens===null?[]:[`<li class="chip">Lens: ${g(r.lens)}</li>`],...r.inputs.map(d=>`<li class="chip">${g(d)}</li>`)],u=Array.from({length:t},(d,p)=>`<option value="${p+1}">${p+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${c}" data-slug="${n}" data-number="${r.number}" data-title="${o}" data-registered="${g(r.registeredAt)}">`,`<a class="thumb" href="${i}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${a}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${c}"><a href="${i}" target="_blank" rel="noopener">${r.number}. ${o}</a></h2>`,`<p class="meta">${n} \xB7 v${r.version} \xB7 ${g(ye(r.registeredAt))}</p>`,...l.length===0?[]:[`<ul class="chips">${l.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${g(r.description)}</p>`],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${c}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${c}"><option value="">None</option>${u.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${c}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}s(xe,"renderCard");function we(){return`
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
`}s(we,"renderStyles");var R=["copy-probe","record-index","register","render"],Ne=new Set(R),$e=[{name:"description",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"note",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],Ae={"copy-probe":{required:[],optional:[]},"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","note","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]}};async function je(){try{let e=await Re({argv:m.argv.slice(2),now:new Date});m.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(m.exitCode=1)}catch(e){m.stderr.write(`index-prototypes: ${y(e)}
`),m.exit(1)}}s(je,"main");Ce()&&await je();async function Re(e){let t;try{t=Me(e.argv)}catch(r){return f("invalid-args",y(r))}switch(t.command){case"copy-probe":return{ok:!0,command:"copy-probe",function:O};case"record-index":return _e(j(t.values),b(t.values,"url"));case"register":return Ve(j(t.values),t.values,t.notes,e.now);case"render":return Le(j(t.values),v.resolve(b(t.values,"out")));default:{let r=t.command;throw new Error(`unhandled command: ${String(r)}`)}}}s(Re,"runIndexPrototypes");function Me(e){let{positionals:t,flags:r}=C(e,$e),[n,o]=t;if(n===void 0)throw new Error(`a command is required: ${R.join(", ")}`);if(!Pe(n))throw new Error(`unknown command "${n}"; expected one of ${R.join(", ")}`);if(o!==void 0)throw new Error(`unexpected argument: ${o}`);let i=r.filter(d=>d.name==="note"),c=I(r.filter(d=>d.name!=="note")),{required:a,optional:l}=Ae[n];if(i.length>0&&!l.includes("note"))throw new Error(`${n} does not take --note`);for(let[d,p]of Object.entries(c)){if(!a.includes(d)&&!l.includes(d))throw new Error(`${n} does not take --${d}`);if(p==="")throw new Error(`--${d} requires a value`)}for(let d of a)if(c[d]===void 0)throw new Error(`${n} requires --${d}`);let u=i.map(d=>Ie(d.value??""));return{command:n,values:c,notes:u}}s(Me,"parseArgs");function f(e,t){return{ok:!1,error:e,message:t}}s(f,"fail");function Pe(e){return Ne.has(e)}s(Pe,"isCommand");function Ce(){let e=m.argv[1];if(e===void 0)return!1;try{return Y(Ee(import.meta.url))===Y(e)}catch(t){return m.stderr.write(`index-prototypes: warning: could not determine entry point: ${y(t)}
`),!1}}s(Ce,"isEntryPoint");function H(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}s(H,"isWebUrl");function Ie(e){let t=e.indexOf(":"),r=t===-1?"":e.slice(0,t).trim(),n=t===-1?"":e.slice(t+1).trim();if(r===""||n==="")throw new Error(`--note "${e}" must have the form "<label>: <value>"`);return{label:r,value:n}}s(Ie,"parseNote");function Te(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}s(Te,"parseInputs");async function Oe(e){try{return await ke(e)}catch(t){if(h(t))return null;throw t}}s(Oe,"readShot");async function _e(e,t){if(!H(t))return f("invalid-url",`--url "${t}" is not an http or https URL`);let r=await S(e);return r.kind==="missing"?f("manifest-not-found",`no manifest in ${e}; register a prototype first`):r.kind==="invalid"?f("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await A(e,{...r.manifest,indexUrl:t}),indexUrl:t}}s(_e,"recordIndex");async function Ve(e,t,r,n){let o=b(t,"slug");if(!W(o))return f("invalid-slug",`slug "${o}" must match [a-z0-9][a-z0-9-]{0,39}`);let i=b(t,"url");if(!H(i))return f("invalid-url",`--url "${i}" is not an http or https URL`);let c=await S(e);if(c.kind==="invalid")return f("invalid-manifest",c.message);let a=c.kind==="ok"?c.manifest:null,l=t["set-title"]??a?.title;if(l===void 0)return f("missing-set-title","the first registration in a set requires --set-title");let u=D(a,o),d=null,p=t.screenshot;if(p!==void 0){let k=await V({sourcePath:v.resolve(p),setDir:e,slug:o,version:u});if(!k.ok)return f(k.error,k.message);d=k.shot}let M={slug:o,number:B(a,o),version:u,registeredAt:n.toISOString(),title:b(t,"title"),url:i,source:t.source??null,lens:t.lens??null,inputs:Te(t.inputs),description:t.description??null,notes:r,shot:d},J={title:l,indexUrl:a?.indexUrl??null,summary:a?.summary??null,entries:[...a?.entries??[],M]};return{ok:!0,command:"register",manifestPath:await A(e,J),entry:M}}s(Ve,"register");async function Le(e,t){let r=await S(e);if(r.kind==="missing")return f("manifest-not-found",`no manifest in ${e}; register a prototype first`);if(r.kind==="invalid")return f("invalid-manifest",r.message);let{manifest:n}=r,o=[],i=[];for(let l of q(n)){let u=l.shot===null?null:await Oe(v.join(e,l.shot));l.shot!==null&&u===null&&i.push(l.slug),o.push({entry:l,shot:u})}let c=G({title:n.title,cards:o}),a=Buffer.byteLength(c,"utf8");return a>N?f("page-too-large",`the page is ${a} bytes, over the ${N}-byte artifact cap`):(await ve(v.dirname(t),{recursive:!0}),await Se(t,c,"utf8"),{ok:!0,command:"render",path:t,bytes:a,cards:o.length,title:n.title,indexUrl:n.indexUrl,missingShots:i,...a>U&&{warning:`the page is ${a} bytes, approaching the ${N}-byte artifact cap`}})}s(Le,"render");function b(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}s(b,"requireFlag");function j(e){return v.resolve(b(e,"set-dir"))}s(j,"resolveSetDir");export{Me as parseArgs,Re as runIndexPrototypes};
