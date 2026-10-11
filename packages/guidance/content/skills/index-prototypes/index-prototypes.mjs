import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var H=Object.defineProperty;var s=(e,t)=>H(e,"name",{value:t,configurable:!0});import{realpathSync as D}from"node:fs";import{mkdir as he,readFile as be,writeFile as xe}from"node:fs/promises";import y from"node:path";import g from"node:process";import{fileURLToPath as ye}from"node:url";function M(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}s(M,"isError");function x(e){try{return M(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}s(x,"describeError");function R(e,t){let r=[],n=[];for(let i=0;i<e.length;i+=1){let o=e[i];if(o===void 0)continue;if(!o.startsWith("--")){r.push(o);continue}let c=Y(o,t);if(c===null)throw new Error(`unknown flag: ${o}`);let{spec:d,inlineValue:a}=c;if(!d.takesValue){if(a!==null)throw new Error(`--${d.name} does not take a value`);n.push({name:d.name,value:null});continue}if(a!==null){n.push({name:d.name,value:a});continue}let l=e[i+1]??null;if(l===null||l.startsWith("--"))throw new Error(`--${d.name} requires a value`);n.push({name:d.name,value:l}),i+=1}return{positionals:r,flags:n}}s(R,"scanFlags");function P(e){let t={};for(let{name:r,value:n}of e)n!==null&&(t[r]=n);return t}s(P,"valueFlagMap");function Y(e,t){for(let r of t)for(let n of[r.name,...r.aliases??[]]){let i=`--${n}`;if(e===i)return{spec:r,inlineValue:null};if(e.startsWith(`${i}=`))return{spec:r,inlineValue:e.slice(i.length+1)}}return null}s(Y,"matchFlag");function J(e,t){return T(e)&&e.code===t}s(J,"isErrorCode");function p(e){return J(e,"ENOENT")}s(p,"isEnoent");function $(e){return T(e)&&!Array.isArray(e)}s($,"isRecord");function T(e){return typeof e=="object"&&e!==null}s(T,"isObject");import{copyFile as X,mkdir as Q,readFile as Z}from"node:fs/promises";import j from"node:path";var C=Buffer.from([137,80,78,71,13,10,26,10]);async function I(e){let t;try{t=await Z(e.sourcePath)}catch(i){if(p(i))return{ok:!1,error:"screenshot-not-found",message:`no screenshot at ${e.sourcePath}`};throw i}if(!t.subarray(0,C.length).equals(C))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=j.join("shots",`${e.slug}-v${e.version}.png`),n=j.join(e.setDir,r);return await Q(j.dirname(n),{recursive:!0}),await X(e.sourcePath,n),{ok:!0,shot:r}}s(I,"intakeScreenshot");import{mkdir as ee,readFile as te,rename as re,rm as ne,writeFile as ie}from"node:fs/promises";import O from"node:path";import se from"node:process";var V="manifest.json",oe=/^[a-z0-9][a-z0-9-]{0,39}$/;function _(e){return oe.test(e)}s(_,"isValidSlug");function L(e){let t=new Map;for(let r of e.entries){let n=t.get(r.slug);(n===void 0||r.version>n.version)&&t.set(r.slug,r)}return t.values().toArray()}s(L,"listLatestEntries");function F(e,t){let r=e?.entries??[],n=0;for(let i of r)i.slug===t&&i.version>n&&(n=i.version);return n+1}s(F,"nextVersion");function q(e,t){let r=e?.entries??[],n=0;for(let i of r){if(i.slug===t)return i.number;n=Math.max(n,i.number)}return n+1}s(q,"resolveNumber");async function k(e){let t=W(e),r;try{r=await te(t,"utf8")}catch(i){if(p(i))return{kind:"missing"};throw i}let n;try{n=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return ae(n)?{kind:"ok",manifest:de(n)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}s(k,"readManifest");function W(e){return O.join(e,V)}s(W,"resolveManifestPath");async function A(e,t){await ee(e,{recursive:!0});let r=W(e),n=O.join(e,`.${V}.${se.pid}.${Date.now()}.tmp`);try{await ie(n,`${JSON.stringify(t,null,2)}
`,"utf8"),await re(n,r)}catch(i){throw await ne(n,{force:!0}),i}return r}s(A,"writeManifest");function ae(e){return $(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&Array.isArray(e.entries)&&e.entries.every(t=>ce(t)):!1}s(ae,"isStoredManifest");function ce(e){return $(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&v(e.source)&&v(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&v(e.description)&&v(e.shot):!1}s(ce,"isStoredEntry");function de(e){let t=new Map;for(let i of e.entries){let o=t.get(i.slug);i.number!==void 0&&(o===void 0||i.version>o.version)&&t.set(i.slug,{version:i.version,number:i.number})}let r=new Map(t.entries().map(([i,{number:o}])=>[i,o])),n=Math.max(0,...r.values());for(let i of e.entries)r.has(i.slug)||(n+=1,r.set(i.slug,n));return{...e,entries:e.entries.map(i=>{let o=r.get(i.slug);if(o===void 0)throw new Error(`slug "${i.slug}" was not numbered`);return{...i,number:o}})}}s(de,"numberEntries");function v(e){return e===null||typeof e=="string"}s(v,"isNullableString");var le="verdicts";var U=`(() => {
  'use strict';
  const COLLECTION = '${le}';
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
`;var ue=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],fe={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function E(e){return ue.map(t=>`--${t}: ${fe[e][t]};`).join(" ")}s(E,"renderTokenDeclarations");var z=12e6,S=16e6;function B(e){let t=f(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${me()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(n=>pe(n,r)),"</div>","</main>",`<script>${U}</script>`,""].join(`
`)}s(B,"renderIndexPage");function f(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}s(f,"escapeHtml");function ge(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}s(ge,"formatTimestamp");function pe(e,t){let{entry:r}=e,n=f(r.slug),i=f(r.title),o=f(r.url),c=`title-${n}`,d=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${i}">`,a=[...r.lens===null?[]:[`<li class="chip">Lens: ${f(r.lens)}</li>`],...r.inputs.map(h=>`<li class="chip">${f(h)}</li>`)],l=Array.from({length:t},(h,b)=>`<option value="${b+1}">${b+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${c}" data-slug="${n}" data-number="${r.number}" data-title="${i}" data-registered="${f(r.registeredAt)}">`,`<a class="thumb" href="${o}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${d}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${c}"><a href="${o}" target="_blank" rel="noopener">${r.number}. ${i}</a></h2>`,`<p class="meta">${n} \xB7 v${r.version} \xB7 ${f(ge(r.registeredAt))}</p>`,...a.length===0?[]:[`<ul class="chips">${a.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${f(r.description)}</p>`],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${c}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${c}"><option value="">None</option>${l.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${c}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}s(pe,"renderCard");function me(){return`
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
`}s(me,"renderStyles");var N=["record-index","register","render"],we=new Set(N),ve=[{name:"description",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],ke={"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]}};async function Ee(){try{let e=await Se({argv:g.argv.slice(2),now:new Date});g.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(g.exitCode=1)}catch(e){g.stderr.write(`index-prototypes: ${x(e)}
`),g.exit(1)}}s(Ee,"main");Ae()&&await Ee();async function Se(e){let t;try{t=$e(e.argv)}catch(n){return u("invalid-args",x(n))}let r=y.resolve(m(t.values,"set-dir"));switch(t.command){case"record-index":return Re(r,m(t.values,"url"));case"register":return Pe(r,t.values,e.now);case"render":return Te(r,y.resolve(m(t.values,"out")));default:{let n=t.command;throw new Error(`unhandled command: ${String(n)}`)}}}s(Se,"runIndexPrototypes");function $e(e){let{positionals:t,flags:r}=R(e,ve),[n,i]=t;if(n===void 0)throw new Error(`a command is required: ${N.join(", ")}`);if(!je(n))throw new Error(`unknown command "${n}"; expected one of ${N.join(", ")}`);if(i!==void 0)throw new Error(`unexpected argument: ${i}`);let o=P(r),{required:c,optional:d}=ke[n];for(let[a,l]of Object.entries(o)){if(!c.includes(a)&&!d.includes(a))throw new Error(`${n} does not take --${a}`);if(l==="")throw new Error(`--${a} requires a value`)}for(let a of c)if(o[a]===void 0)throw new Error(`${n} requires --${a}`);return{command:n,values:o}}s($e,"parseArgs");function u(e,t){return{ok:!1,error:e,message:t}}s(u,"fail");function je(e){return we.has(e)}s(je,"isCommand");function Ae(){let e=g.argv[1];if(e===void 0)return!1;try{return D(ye(import.meta.url))===D(e)}catch(t){return g.stderr.write(`index-prototypes: warning: could not determine entry point: ${x(t)}
`),!1}}s(Ae,"isEntryPoint");function K(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}s(K,"isWebUrl");function Ne(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}s(Ne,"parseInputs");async function Me(e){try{return await be(e)}catch(t){if(p(t))return null;throw t}}s(Me,"readShot");async function Re(e,t){if(!K(t))return u("invalid-url",`--url "${t}" is not an http or https URL`);let r=await k(e);return r.kind==="missing"?u("manifest-not-found",`no manifest in ${e}; register a prototype first`):r.kind==="invalid"?u("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await A(e,{...r.manifest,indexUrl:t}),indexUrl:t}}s(Re,"recordIndex");async function Pe(e,t,r){let n=m(t,"slug");if(!_(n))return u("invalid-slug",`slug "${n}" must match [a-z0-9][a-z0-9-]{0,39}`);let i=m(t,"url");if(!K(i))return u("invalid-url",`--url "${i}" is not an http or https URL`);let o=await k(e);if(o.kind==="invalid")return u("invalid-manifest",o.message);let c=o.kind==="ok"?o.manifest:null,d=t["set-title"]??c?.title;if(d===void 0)return u("missing-set-title","the first registration in a set requires --set-title");let a=F(c,n),l=null,h=t.screenshot;if(h!==void 0){let w=await I({sourcePath:y.resolve(h),setDir:e,slug:n,version:a});if(!w.ok)return u(w.error,w.message);l=w.shot}let b={slug:n,number:q(c,n),version:a,registeredAt:r.toISOString(),title:m(t,"title"),url:i,source:t.source??null,lens:t.lens??null,inputs:Ne(t.inputs),description:t.description??null,shot:l},G={title:d,indexUrl:c?.indexUrl??null,entries:[...c?.entries??[],b]};return{ok:!0,command:"register",manifestPath:await A(e,G),entry:b}}s(Pe,"register");async function Te(e,t){let r=await k(e);if(r.kind==="missing")return u("manifest-not-found",`no manifest in ${e}; register a prototype first`);if(r.kind==="invalid")return u("invalid-manifest",r.message);let{manifest:n}=r,i=[],o=[];for(let a of L(n)){let l=a.shot===null?null:await Me(y.join(e,a.shot));a.shot!==null&&l===null&&o.push(a.slug),i.push({entry:a,shot:l})}let c=B({title:n.title,cards:i}),d=Buffer.byteLength(c,"utf8");return d>S?u("page-too-large",`the page is ${d} bytes, over the ${S}-byte artifact cap`):(await he(y.dirname(t),{recursive:!0}),await xe(t,c,"utf8"),{ok:!0,command:"render",path:t,bytes:d,cards:i.length,title:n.title,indexUrl:n.indexUrl,missingShots:o,...d>z&&{warning:`the page is ${d} bytes, approaching the ${S}-byte artifact cap`}})}s(Te,"render");function m(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}s(m,"requireFlag");export{$e as parseArgs,Se as runIndexPrototypes};
