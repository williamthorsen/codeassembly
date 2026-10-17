import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var re=Object.defineProperty;var i=(e,t)=>re(e,"name",{value:t,configurable:!0});import{realpathSync as X}from"node:fs";import{mkdir as Me,readFile as Q,writeFile as Re}from"node:fs/promises";import w from"node:path";import y from"node:process";import{fileURLToPath as Ae}from"node:url";function O(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}i(O,"isError");function v(e){try{return O(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}i(v,"describeError");function _(e,t){let r=[],s=[];for(let n=0;n<e.length;n+=1){let o=e[n];if(o===void 0)continue;if(!o.startsWith("--")){r.push(o);continue}let d=ne(o,t);if(d===null)throw new Error(`unknown flag: ${o}`);let{spec:a,inlineValue:u}=d;if(!a.takesValue){if(u!==null)throw new Error(`--${a.name} does not take a value`);s.push({name:a.name,value:null});continue}if(u!==null){s.push({name:a.name,value:u});continue}let f=e[n+1]??null;if(f===null||f.startsWith("--"))throw new Error(`--${a.name} requires a value`);s.push({name:a.name,value:f}),n+=1}return{positionals:r,flags:s}}i(_,"scanFlags");function V(e){let t={};for(let{name:r,value:s}of e)s!==null&&(t[r]=s);return t}i(V,"valueFlagMap");function ne(e,t){for(let r of t)for(let s of[r.name,...r.aliases??[]]){let n=`--${s}`;if(e===n)return{spec:r,inlineValue:null};if(e.startsWith(`${n}=`))return{spec:r,inlineValue:e.slice(n.length+1)}}return null}i(ne,"matchFlag");function se(e,t){return L(e)&&e.code===t}i(se,"isErrorCode");function h(e){return se(e,"ENOENT")}i(h,"isEnoent");function b(e){return L(e)&&!Array.isArray(e)}i(b,"isRecord");function L(e){return typeof e=="object"&&e!==null}i(L,"isObject");var F=String.raw`() => {
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
}`;import{copyFile as ie,mkdir as oe,readFile as ae}from"node:fs/promises";import R from"node:path";var W=Buffer.from([137,80,78,71,13,10,26,10]);async function q(e){let t;try{t=await ae(e.sourcePath)}catch(n){if(h(n))return{ok:!1,error:"screenshot-not-found",message:`the screenshot ${e.sourcePath} does not exist`};throw n}if(!t.subarray(0,W.length).equals(W))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=R.join("shots",`${e.slug}-v${e.version}.png`),s=R.join(e.setDir,r);return await oe(R.dirname(s),{recursive:!0}),await ie(e.sourcePath,s),{ok:!0,shot:r}}i(q,"intakeScreenshot");import{mkdir as de,readFile as ce,rename as le,rm as ue,writeFile as fe}from"node:fs/promises";import z from"node:path";import me from"node:process";var B="manifest.json",ge=/^[a-z0-9][a-z0-9-]{0,39}$/;function $(e,t){return`${e}.${t}`}i($,"formatId");function A(e){return ge.test(e)}i(A,"isValidSlug");function D(e){let t=new Map;for(let r of e.entries){let s=t.get(r.slug);(s===void 0||r.version>s.version)&&t.set(r.slug,r)}return t.values().toArray()}i(D,"listLatestEntries");function I(e,t){let r=e?.entries??[],s=0;for(let n of r)n.slug===t&&n.version>s&&(s=n.version);return s+1}i(I,"nextVersion");async function x(e){let t=U(e),r;try{r=await ce(t,"utf8")}catch(n){if(h(n))return{kind:"missing"};throw n}let s;try{s=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return ye(s)?{kind:"ok",manifest:xe(s)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}i(x,"readManifest");function K(e,t){let r=e?.entries??[],s=new Map,n=0;for(let o of r)s.set(o.slug,o.number),n=Math.max(n,o.number);return t.map(o=>{let d=s.get(o);d===void 0&&(n+=1,d=n,s.set(o,d));let a=I(e,o);return{slug:o,number:d,version:a,id:$(d,a)}})}i(K,"resolveIds");function U(e){return z.join(e,B)}i(U,"resolveManifestPath");function G(e,t){let r=e?.entries??[],s=0;for(let n of r){if(n.slug===t)return n.number;s=Math.max(s,n.number)}return s+1}i(G,"resolveNumber");async function N(e,t){await de(e,{recursive:!0});let r=U(e),s=z.join(e,`.${B}.${me.pid}.${Date.now()}.tmp`);try{await fe(s,`${JSON.stringify(t,null,2)}
`,"utf8"),await le(s,r)}catch(n){throw await ue(s,{force:!0}),n}return r}i(N,"writeManifest");function pe(e){return b(e)&&typeof e.label=="string"&&typeof e.value=="string"}i(pe,"isNote");function k(e){return e===null||typeof e=="string"}i(k,"isNullableString");function he(e){return b(e)?typeof e.shared=="string"&&k(e.changes)&&Array.isArray(e.try)&&e.try.every(t=>typeof t=="string"):!1}i(he,"isSetSummary");function be(e){return b(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&k(e.source)&&k(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&k(e.description)&&(e.notes===void 0||Array.isArray(e.notes)&&e.notes.every(t=>pe(t)))&&k(e.shot):!1}i(be,"isStoredEntry");function ye(e){return b(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&(e.summary===void 0||e.summary===null||he(e.summary))&&Array.isArray(e.entries)&&e.entries.every(t=>be(t)):!1}i(ye,"isStoredManifest");function xe(e){let t=new Map;for(let n of e.entries){let o=t.get(n.slug);n.number!==void 0&&(o===void 0||n.version>o.version)&&t.set(n.slug,{version:n.version,number:n.number})}let r=new Map(t.entries().map(([n,{number:o}])=>[n,o])),s=Math.max(0,...r.values());for(let n of e.entries)r.has(n.slug)||(s+=1,r.set(n.slug,s));return{...e,summary:e.summary??null,entries:e.entries.map(n=>{let o=r.get(n.slug);if(o===void 0)throw new Error(`slug "${n.slug}" was not numbered`);return{...n,number:o,notes:n.notes??[]}})}}i(xe,"normalizeManifest");var we="verdicts";var Y=`(() => {
  'use strict';
  const COLLECTION = '${we}';
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
      parts.push(winnerCard ? 'winner: ' + winnerCard.dataset.id + ' ' + winnerCard.dataset.title : 'no winner yet');
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
      setStatus('This verdict was not saved because the verdict store is full.');
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
      // Move focus between cards with the arrow keys only from a focused card, so that the page scrolls as usual
      // elsewhere.
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
`;var ve=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],ke={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function j(e){return ve.map(t=>`--${t}: ${ke[e][t]};`).join(" ")}i(j,"renderTokenDeclarations");var H=12e6,M=16e6;function J(e){let t=m(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${Ne()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,...e.summary===null?[]:[je(e.summary)],`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(s=>Ee(s,r)),"</div>","</main>",`<script>${Y}</script>`,""].join(`
`)}i(J,"renderIndexPage");function m(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}i(m,"escapeHtml");function Se(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}i(Se,"formatTimestamp");function Ee(e,t){let{entry:r}=e,s=m(r.slug),n=m(r.title),o=m(r.url),d=`title-${s}`,a=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${n}">`,u=[...r.lens===null?[]:[`<li class="chip">Lens: ${m(r.lens)}</li>`],...r.inputs.map(l=>`<li class="chip">${m(l)}</li>`)],f=Array.from({length:t},(l,p)=>`<option value="${p+1}">${p+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${d}" data-slug="${s}" data-number="${r.number}" data-id="${$(r.number,r.version)}" data-title="${n}" data-registered="${m(r.registeredAt)}">`,`<a class="thumb" href="${o}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${a}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${d}"><a href="${o}" target="_blank" rel="noopener">${$(r.number,r.version)} ${n}</a></h2>`,`<p class="meta">${s} \xB7 ${m(Se(r.registeredAt))}</p>`,...u.length===0?[]:[`<ul class="chips">${u.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${m(r.description)}</p>`],...r.notes.length===0?[]:[$e(r.notes)],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${d}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${d}"><option value="">None</option>${f.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${d}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}i(Ee,"renderCard");function $e(e){return`<dl class="notes">${e.map(r=>`<dt>${m(r.label)}</dt><dd>${m(r.value)}</dd>`).join("")}</dl>`}i($e,"renderNotes");function Ne(){return`
:root { color-scheme: light; ${j("light")} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${j("dark")} }
}
:root[data-theme="dark"] { color-scheme: dark; ${j("dark")} }
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
.set-summary { margin: 12px 0 8px; max-width: 72ch; }
.set-summary dl { margin: 0; }
.set-summary dt { margin-top: 8px; color: var(--text-muted); font-size: 13px; font-weight: 600; }
.set-summary dt:first-child { margin-top: 0; }
.set-summary dd { margin: 2px 0 0; }
.set-summary ol { margin: 0; padding-left: 1.5em; }
.notes { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; font-size: 14px; }
.notes dt { color: var(--text-muted); font-size: 13px; font-weight: 600; }
.notes dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 420px) { .notes { grid-template-columns: 1fr; } .notes dd { margin-bottom: 4px; } }
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
`}i(Ne,"renderStyles");function je(e){let t=e.try.map(s=>`<li>${m(s)}</li>`);return`<section class="set-summary" aria-label="Set summary"><dl>${[`<dt>Shared</dt><dd>${m(e.shared)}</dd>`,...e.changes===null?[]:[`<dt>Changed in this round</dt><dd>${m(e.changes)}</dd>`],...t.length===0?[]:[`<dt>Try in each</dt><dd><ol>${t.join("")}</ol></dd>`]].join("")}</dl></section>`}i(je,"renderSummary");var P=["copy-probe","describe-set","record-index","register","render","resolve-ids"],Ie=new Set(P),Pe=[{name:"description",takesValue:!0},{name:"file",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"note",takesValue:!0},{name:"number",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"slugs",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],Ce={"copy-probe":{required:[],optional:[]},"describe-set":{required:["file","set-dir"],optional:[]},"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","note","number","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]},"resolve-ids":{required:["set-dir","slugs"],optional:[]}};async function Te(){try{let e=await Oe({argv:y.argv.slice(2),now:new Date});y.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(y.exitCode=1)}catch(e){y.stderr.write(`index-prototypes: ${v(e)}
`),y.exit(1)}}i(Te,"main");Fe()&&await Te();async function Oe(e){let t;try{t=_e(e.argv)}catch(r){return c("invalid-args",v(r))}switch(t.command){case"copy-probe":return{ok:!0,command:"copy-probe",function:F};case"describe-set":return Ve(S(t.values),w.resolve(g(t.values,"file")));case"record-index":return Be(S(t.values),g(t.values,"url"));case"register":return De(S(t.values),t.values,t.notes,e.now);case"render":return Ke(S(t.values),w.resolve(g(t.values,"out")));case"resolve-ids":return Ue(S(t.values),g(t.values,"slugs"));default:{let r=t.command;throw new Error(`unhandled command: ${String(r)}`)}}}i(Oe,"runIndexPrototypes");function _e(e){let{positionals:t,flags:r}=_(e,Pe),[s,n]=t;if(s===void 0)throw new Error(`a command is required: ${P.join(", ")}`);if(!Le(s))throw new Error(`unknown command "${s}"; expected one of ${P.join(", ")}`);if(n!==void 0)throw new Error(`unexpected argument: ${n}`);let o=r.filter(l=>l.name==="note"),d=V(r.filter(l=>l.name!=="note")),{required:a,optional:u}=Ce[s];if(o.length>0&&!u.includes("note"))throw new Error(`${s} does not take --note`);for(let[l,p]of Object.entries(d)){if(!a.includes(l)&&!u.includes(l))throw new Error(`${s} does not take --${l}`);if(p==="")throw new Error(`--${l} requires a value`)}for(let l of a)if(d[l]===void 0)throw new Error(`${s} requires --${l}`);let f=o.map(l=>We(l.value??""));return{command:s,values:d,notes:f}}i(_e,"parseArgs");async function Ve(e,t){let r;try{r=await Q(t,"utf8")}catch(a){if(h(a))return c("summary-not-found",`${t} does not exist`);throw a}let s;try{s=JSON.parse(r)}catch{return c("invalid-summary",`${t} is not valid JSON`)}let n=qe(s);if(typeof n=="string")return c("invalid-summary",`${t}: ${n}`);let o=await x(e);return o.kind==="missing"?c("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):o.kind==="invalid"?c("invalid-manifest",o.message):{ok:!0,command:"describe-set",manifestPath:await N(e,{...o.manifest,summary:n}),summary:n}}i(Ve,"describeSet");function c(e,t){return{ok:!1,error:e,message:t}}i(c,"fail");function Le(e){return Ie.has(e)}i(Le,"isCommand");function Fe(){let e=y.argv[1];if(e===void 0)return!1;try{return X(Ae(import.meta.url))===X(e)}catch(t){return y.stderr.write(`index-prototypes: warning: could not determine entry point: ${v(t)}
`),!1}}i(Fe,"isEntryPoint");function Z(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}i(Z,"isWebUrl");function ee(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}i(ee,"parseInputs");function We(e){let t=e.indexOf(":"),r=t===-1?"":e.slice(0,t).trim(),s=t===-1?"":e.slice(t+1).trim();if(r===""||s==="")throw new Error(`--note "${e}" must have the form "<label>: <value>"`);return{label:r,value:s}}i(We,"parseNote");function qe(e){if(!b(e))return'expected an object with "shared", "changes", and "try"';let{shared:t,changes:r,try:s}=e;if(typeof t!="string"||t.trim()==="")return'"shared" must be a non-empty string';if(r!=null&&typeof r!="string")return'"changes" must be a string or null';if(!Array.isArray(s)||s.some(o=>!(typeof o=="string"&&o.trim()!=="")))return'"try" must be a list of non-empty strings';let n=typeof r=="string"?r.trim():"";return{shared:t.trim(),changes:n===""?null:n,try:s.map(o=>o.trim())}}i(qe,"parseSummary");async function ze(e){try{return await Q(e)}catch(t){if(h(t))return null;throw t}}i(ze,"readShot");async function Be(e,t){if(!Z(t))return c("invalid-url",`--url "${t}" is not an http or https URL`);let r=await x(e);return r.kind==="missing"?c("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):r.kind==="invalid"?c("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await N(e,{...r.manifest,indexUrl:t}),indexUrl:t}}i(Be,"recordIndex");async function De(e,t,r,s){let n=g(t,"slug");if(!A(n))return c("invalid-slug",`slug "${n}" must match [a-z0-9][a-z0-9-]{0,39}`);let o=g(t,"url");if(!Z(o))return c("invalid-url",`--url "${o}" is not an http or https URL`);let d=await x(e);if(d.kind==="invalid")return c("invalid-manifest",d.message);let a=d.kind==="ok"?d.manifest:null,u=t["set-title"]??a?.title;if(u===void 0)return c("missing-set-title","the first registration in a set requires --set-title");let f=Ge(a,n,t.number);if(typeof f!="number")return f;let l=I(a,n),p=null,C=t.screenshot;if(C!==void 0){let E=await q({sourcePath:w.resolve(C),setDir:e,slug:n,version:l});if(!E.ok)return c(E.error,E.message);p=E.shot}let T={slug:n,number:f,version:l,registeredAt:s.toISOString(),title:g(t,"title"),url:o,source:t.source??null,lens:t.lens??null,inputs:ee(t.inputs),description:t.description??null,notes:r,shot:p},te={title:u,indexUrl:a?.indexUrl??null,summary:a?.summary??null,entries:[...a?.entries??[],T]};return{ok:!0,command:"register",manifestPath:await N(e,te),entry:T}}i(De,"register");async function Ke(e,t){let r=await x(e);if(r.kind==="missing")return c("manifest-not-found",`${e} does not contain a manifest; register a prototype first`);if(r.kind==="invalid")return c("invalid-manifest",r.message);let{manifest:s}=r,n=[],o=[];for(let u of D(s)){let f=u.shot===null?null:await ze(w.join(e,u.shot));u.shot!==null&&f===null&&o.push(u.slug),n.push({entry:u,shot:f})}let d=J({title:s.title,summary:s.summary,cards:n}),a=Buffer.byteLength(d,"utf8");return a>M?c("page-too-large",`the page is ${a} bytes, over the ${M}-byte artifact cap`):(await Me(w.dirname(t),{recursive:!0}),await Re(t,d,"utf8"),{ok:!0,command:"render",path:t,bytes:a,cards:n.length,title:s.title,indexUrl:s.indexUrl,missingShots:o,...a>H&&{warning:`the page is ${a} bytes, approaching the ${M}-byte artifact cap`}})}i(Ke,"render");function g(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}i(g,"requireFlag");async function Ue(e,t){let r=ee(t);if(r.length===0)return c("invalid-args","--slugs requires at least one slug");let s=r.find(d=>!A(d));if(s!==void 0)return c("invalid-slug",`slug "${s}" must match [a-z0-9][a-z0-9-]{0,39}`);if(new Set(r).size!==r.length)return c("invalid-args","--slugs names a slug twice");let n=await x(e);if(n.kind==="invalid")return c("invalid-manifest",n.message);let o=n.kind==="ok"?n.manifest:null;return{ok:!0,command:"resolve-ids",ids:K(o,r)}}i(Ue,"resolveIdsForSlugs");function Ge(e,t,r){let s=G(e,t);if(r===void 0)return s;let n=Number(r);if(!Number.isSafeInteger(n)||n<1)return c("number-conflict",`--number "${r}" must be a positive integer`);let o=e?.entries??[];if(o.some(a=>a.slug===t))return s===n?n:c("number-conflict",`slug "${t}" is number ${s}, not ${n}`);let d=o.find(a=>a.number===n);return d===void 0?n:c("number-conflict",`number ${n} belongs to slug "${d.slug}"`)}i(Ge,"resolveRegistrationNumber");function S(e){return w.resolve(g(e,"set-dir"))}i(S,"resolveSetDir");export{_e as parseArgs,Oe as runIndexPrototypes};
