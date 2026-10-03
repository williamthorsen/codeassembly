import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var Q=Object.defineProperty;var i=(e,t)=>Q(e,"name",{value:t,configurable:!0});import{realpathSync as Y}from"node:fs";import{mkdir as ke,readFile as Ee,writeFile as Se}from"node:fs/promises";import w from"node:path";import p from"node:process";import{fileURLToPath as $e}from"node:url";function T(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}i(T,"isError");function x(e){try{return T(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}i(x,"describeError");function C(e,t){let r=[],n=[];for(let a=0;a<e.length;a+=1){let o=e[a];if(o===void 0)continue;if(!o.startsWith("--")){r.push(o);continue}let c=Z(o,t);if(c===null)throw new Error(`unknown flag: ${o}`);let{spec:s,inlineValue:d}=c;if(!s.takesValue){if(d!==null)throw new Error(`--${s.name} does not take a value`);n.push({name:s.name,value:null});continue}if(d!==null){n.push({name:s.name,value:d});continue}let l=e[a+1]??null;if(l===null||l.startsWith("--"))throw new Error(`--${s.name} requires a value`);n.push({name:s.name,value:l}),a+=1}return{positionals:r,flags:n}}i(C,"scanFlags");function I(e){let t={};for(let{name:r,value:n}of e)n!==null&&(t[r]=n);return t}i(I,"valueFlagMap");function Z(e,t){for(let r of t)for(let n of[r.name,...r.aliases??[]]){let a=`--${n}`;if(e===a)return{spec:r,inlineValue:null};if(e.startsWith(`${a}=`))return{spec:r,inlineValue:e.slice(a.length+1)}}return null}i(Z,"matchFlag");function ee(e,t){return V(e)&&e.code===t}i(ee,"isErrorCode");function g(e){return ee(e,"ENOENT")}i(g,"isEnoent");function y(e){return V(e)&&!Array.isArray(e)}i(y,"isRecord");function V(e){return typeof e=="object"&&e!==null}i(V,"isObject");import{execFile as te}from"node:child_process";import{copyFile as _,mkdir as re,readFile as ne}from"node:fs/promises";import R from"node:path";var F=640,O=Buffer.from([137,80,78,71,13,10,26,10]);async function L(e){let t;try{t=await ne(e.sourcePath)}catch(s){if(g(s))return{ok:!1,error:"screenshot-not-found",message:`no screenshot at ${e.sourcePath}`};throw s}if(!ie(t))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=R.join("shots",`${e.slug}-v${e.version}.png`),n=R.join(e.setDir,r);if(await re(R.dirname(n),{recursive:!0}),ae(t)<=F)return await _(e.sourcePath,n),{ok:!0,shot:r,downsized:!1};let o=await(e.runner??se)(["sips","--resampleWidth",String(F),"--out",n,e.sourcePath]);if(o.status===0)return{ok:!0,shot:r,downsized:!0};await _(e.sourcePath,n);let c=o.status===null?"sips is not available":`sips exited ${o.status}: ${o.stderr.trim()||"no output"}`;return{ok:!0,shot:r,downsized:!1,warning:`${c}; stored the screenshot at its original size`}}i(L,"intakeScreenshot");function ie(e){return e.length>=24&&e.subarray(0,O.length).equals(O)}i(ie,"isPng");function ae(e){return e.readUInt32BE(16)}i(ae,"readPngWidth");async function se(e){let[t,...r]=e;if(t===void 0)throw new Error("runCommand requires a command");return new Promise(n=>{te(t,r,(a,o,c)=>{if(a===null){n({status:0,stderr:c});return}if(g(a)){n({status:null,stderr:c});return}let s=y(a)&&typeof a.code=="number"?a.code:1;n({status:s,stderr:c})})})}i(se,"runCommand");import{mkdir as oe,readFile as ce,rename as de,rm as le,writeFile as ue}from"node:fs/promises";import W from"node:path";import fe from"node:process";var q="manifest.json",ge=/^[a-z0-9][a-z0-9-]{0,39}$/;function z(e){return ge.test(e)}i(z,"isValidSlug");function B(e){let t=new Map;for(let r of e.entries){let n=t.get(r.slug);(n===void 0||r.version>n.version)&&t.set(r.slug,r)}return t.values().toArray()}i(B,"listLatestEntries");function U(e,t){let r=e?.entries??[],n=0;for(let a of r)a.slug===t&&a.version>n&&(n=a.version);return n+1}i(U,"nextVersion");async function E(e){let t=D(e),r;try{r=await ce(t,"utf8")}catch(a){if(g(a))return{kind:"missing"};throw a}let n;try{n=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return pe(n)?{kind:"ok",manifest:n}:{kind:"invalid",message:`${t} does not have the manifest layout`}}i(E,"readManifest");function D(e){return W.join(e,q)}i(D,"resolveManifestPath");async function N(e,t){await oe(e,{recursive:!0});let r=D(e),n=W.join(e,`.${q}.${fe.pid}.${Date.now()}.tmp`);try{await ue(n,`${JSON.stringify(t,null,2)}
`,"utf8"),await de(n,r)}catch(a){throw await le(n,{force:!0}),a}return r}i(N,"writeManifest");function pe(e){return y(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&Array.isArray(e.entries)&&e.entries.every(t=>me(t)):!1}i(pe,"isManifest");function me(e){return y(e)?typeof e.slug=="string"&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&k(e.source)&&k(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&k(e.description)&&k(e.shot)&&typeof e.downsized=="boolean":!1}i(me,"isManifestEntry");function k(e){return e===null||typeof e=="string"}i(k,"isNullableString");var he="verdicts";var K=`(() => {
  'use strict';
  const COLLECTION = '${he}';
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

    const parts = [cards.length + (cards.length === 1 ? ' prototype' : ' prototypes')];
    if (state.db !== null) {
      const winnerCard = winner === null ? null : bySlug.get(winner);
      parts.push(winnerCard ? 'winner: ' + winnerCard.dataset.title : 'no winner yet');
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

  function moveFocus(card, step) {
    const visible = Array.from(grid.querySelectorAll('.card')).filter((candidate) => !candidate.hidden);
    if (visible.length === 0) return;
    const index = card ? visible.indexOf(card) : -1;
    const target = index === -1 ? visible[0] : visible[Math.min(visible.length - 1, Math.max(0, index + step))];
    target.focus();
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
    if (key === 'j' || key === 'k') {
      event.preventDefault();
      moveFocus(card, key === 'j' ? 1 : -1);
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
`;var be=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],xe={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function S(e){return be.map(t=>`--${t}: ${xe[e][t]};`).join(" ")}i(S,"renderTokenDeclarations");var G=12e6,$=16e6;function H(e){let t=f(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${ve()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>Keys: <kbd>j</kbd> / <kbd>k</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(n=>we(n,r)),"</div>","</main>",`<script>${K}</script>`,""].join(`
`)}i(H,"renderIndexPage");function f(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}i(f,"escapeHtml");function ye(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}i(ye,"formatTimestamp");function we(e,t){let{entry:r}=e,n=f(r.slug),a=f(r.title),o=f(r.url),c=`title-${n}`,s=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${a}">`,d=[...r.lens===null?[]:[`<li class="chip">Lens: ${f(r.lens)}</li>`],...r.inputs.map(h=>`<li class="chip">${f(h)}</li>`)],l=Array.from({length:t},(h,b)=>`<option value="${b+1}">${b+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${c}" data-slug="${n}" data-title="${a}" data-registered="${f(r.registeredAt)}">`,`<a class="thumb" href="${o}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${s}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${c}"><a href="${o}" target="_blank" rel="noopener">${a}</a></h2>`,`<p class="meta">${n} \xB7 v${r.version} \xB7 ${f(ye(r.registeredAt))}</p>`,...d.length===0?[]:[`<ul class="chips">${d.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${f(r.description)}</p>`],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${c}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${c}"><option value="">None</option>${l.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${c}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}i(we,"renderCard");function ve(){return`
:root { color-scheme: light; ${S("light")} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${S("dark")} }
}
:root[data-theme="dark"] { color-scheme: dark; ${S("dark")} }
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
`}i(ve,"renderStyles");var A=["record-index","register","render"],je=new Set(A),Re=[{name:"description",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],Ne={"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]}};async function Ae(){try{let e=await Pe({argv:p.argv.slice(2),now:new Date});p.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(p.exitCode=1)}catch(e){p.stderr.write(`index-prototypes: ${x(e)}
`),p.exit(1)}}i(Ae,"main");Ce()&&await Ae();async function Pe(e){let t;try{t=Me(e.argv)}catch(n){return u("invalid-args",x(n))}let r=w.resolve(m(t.values,"set-dir"));switch(t.command){case"record-index":return _e(r,m(t.values,"url"));case"register":return Fe(r,t.values,e.now,e.runner);case"render":return Oe(r,w.resolve(m(t.values,"out")));default:{let n=t.command;throw new Error(`unhandled command: ${String(n)}`)}}}i(Pe,"runIndexPrototypes");function Me(e){let{positionals:t,flags:r}=C(e,Re),[n,a]=t;if(n===void 0)throw new Error(`a command is required: ${A.join(", ")}`);if(!Te(n))throw new Error(`unknown command "${n}"; expected one of ${A.join(", ")}`);if(a!==void 0)throw new Error(`unexpected argument: ${a}`);let o=I(r),{required:c,optional:s}=Ne[n];for(let[d,l]of Object.entries(o)){if(!c.includes(d)&&!s.includes(d))throw new Error(`${n} does not take --${d}`);if(l==="")throw new Error(`--${d} requires a value`)}for(let d of c)if(o[d]===void 0)throw new Error(`${n} requires --${d}`);return{command:n,values:o}}i(Me,"parseArgs");function u(e,t){return{ok:!1,error:e,message:t}}i(u,"fail");function Te(e){return je.has(e)}i(Te,"isCommand");function Ce(){let e=p.argv[1];if(e===void 0)return!1;try{return Y($e(import.meta.url))===Y(e)}catch(t){return p.stderr.write(`index-prototypes: warning: could not determine entry point: ${x(t)}
`),!1}}i(Ce,"isEntryPoint");function J(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}i(J,"isWebUrl");function Ie(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}i(Ie,"parseInputs");async function Ve(e){try{return await Ee(e)}catch(t){if(g(t))return null;throw t}}i(Ve,"readShot");async function _e(e,t){if(!J(t))return u("invalid-url",`--url "${t}" is not an http or https URL`);let r=await E(e);return r.kind==="missing"?u("manifest-not-found",`no manifest in ${e}; register a prototype first`):r.kind==="invalid"?u("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await N(e,{...r.manifest,indexUrl:t}),indexUrl:t}}i(_e,"recordIndex");async function Fe(e,t,r,n){let a=m(t,"slug");if(!z(a))return u("invalid-slug",`slug "${a}" must match [a-z0-9][a-z0-9-]{0,39}`);let o=m(t,"url");if(!J(o))return u("invalid-url",`--url "${o}" is not an http or https URL`);let c=await E(e);if(c.kind==="invalid")return u("invalid-manifest",c.message);let s=c.kind==="ok"?c.manifest:null,d=t["set-title"]??s?.title;if(d===void 0)return u("missing-set-title","the first registration in a set requires --set-title");let l=U(s,a),h=null,b=!1,j,P=t.screenshot;if(P!==void 0){let v=await L({sourcePath:w.resolve(P),setDir:e,slug:a,version:l,...n!==void 0&&{runner:n}});if(!v.ok)return u(v.error,v.message);({shot:h,downsized:b,warning:j}=v)}let M={slug:a,version:l,registeredAt:r.toISOString(),title:m(t,"title"),url:o,source:t.source??null,lens:t.lens??null,inputs:Ie(t.inputs),description:t.description??null,shot:h,downsized:b},X={title:d,indexUrl:s?.indexUrl??null,entries:[...s?.entries??[],M]};return{ok:!0,command:"register",manifestPath:await N(e,X),entry:M,...j!==void 0&&{warning:j}}}i(Fe,"register");async function Oe(e,t){let r=await E(e);if(r.kind==="missing")return u("manifest-not-found",`no manifest in ${e}; register a prototype first`);if(r.kind==="invalid")return u("invalid-manifest",r.message);let{manifest:n}=r,a=[],o=[];for(let d of B(n)){let l=d.shot===null?null:await Ve(w.join(e,d.shot));d.shot!==null&&l===null&&o.push(d.slug),a.push({entry:d,shot:l})}let c=H({title:n.title,cards:a}),s=Buffer.byteLength(c,"utf8");return s>$?u("page-too-large",`the page is ${s} bytes, over the ${$}-byte artifact cap`):(await ke(w.dirname(t),{recursive:!0}),await Se(t,c,"utf8"),{ok:!0,command:"render",path:t,bytes:s,cards:a.length,title:n.title,indexUrl:n.indexUrl,missingShots:o,...s>G&&{warning:`the page is ${s} bytes, approaching the ${$}-byte artifact cap`}})}i(Oe,"render");function m(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}i(m,"requireFlag");export{Me as parseArgs,Pe as runIndexPrototypes};
