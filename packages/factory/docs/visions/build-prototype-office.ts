/* eslint no-console: off */
/**
 * build-prototype-office.ts
 *
 * Builds prototype-office.html — the three-zone facility layout:
 *   - Prep area (top-left): architect + planner
 *   - Workshop (top-right): coder + 3 reviewers + findings whiteboard
 *   - Governor's office (bottom, full width): orchestrator + controls + artifacts
 *
 * Assets are read from disk, converted to base64 data URIs, and embedded
 * into a self-contained HTML file.
 *
 * Run: pnpm exec tsx build-prototype-office.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/Users/william/icloude/Resources/Tilesets';

const assetPaths: Record<string, string> = {
  // -- Sheets --
  floors: `${BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Floors_32x32.png`,
  walls: `${BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Walls_32x32.png`,
  floorShadows: `${BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Floor_Shadows_32x32.png`,

  // -- Furniture singles (64x96 each) --
  plant100: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_100.png`,
  chairBack105: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_105.png`,
  cert115: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_115.png`,
  trashCan119: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_119.png`,
  monitor130: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_130.png`,
  reviewMonitor133: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_133.png`,
  smallMonitor136: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_136.png`,
  deskLamp145: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_145.png`,
  wallPainting161: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_161.png`,
  wallPainting163: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_163.png`,
  whiteboard170: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_170.png`,
  dashChart171: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_171.png`,
  analysisBoard172: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_172.png`,
  dataDashboard174: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_174.png`,
  serverRack175: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_175.png`,
  mainframe176: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_176.png`,
  desk180: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_180.png`,
  bookshelf200: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_200.png`,
  coderPC227: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_227.png`,
  cabinet260: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_260.png`,
  waterCooler320: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_320.png`,
  bush339: `${BASE}/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/32x32/Modern_Office_Singles_32x32_339.png`,

  // -- Characters (all idle/standing) --
  adamIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Adam_idle_32x32.png`,
  alexIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Alex_idle_32x32.png`,
  ameliaIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Amelia_idle_32x32.png`,
  bobIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Bob_idle_32x32.png`,
  ashIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Ash_idle_32x32.png`,
  danIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Dan_idle_32x32.png`,
  robIdle: `${BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Rob_idle_32x32.png`,
};

// ── Build base64 data URIs ──────────────────────────────────────────────────
const assets: Record<string, string> = {};
let totalBytes = 0;
for (const [key, filePath] of Object.entries(assetPaths)) {
  const buf = fs.readFileSync(filePath);
  assets[key] = 'data:image/png;base64,' + buf.toString('base64');
  totalBytes += buf.length;
  console.log(`  ${key}: ${(buf.length / 1_024).toFixed(1)} KB`);
}
console.log(`Total asset data: ${(totalBytes / 1_024).toFixed(0)} KB`);

// ── Generate the HTML ───────────────────────────────────────────────────────
const html = buildHTML(JSON.stringify(assets));
const outPath = path.join(import.meta.dirname, 'prototype-office.html');
fs.writeFileSync(outPath, html);
console.log(`Written: ${outPath} (${(html.length / 1_024).toFixed(0)} KB)`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildHTML(assetsJSON: string): string {
  return (
    String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeAssembly — Office prototype</title>
<style>
/* -- Reset & body -- */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #e8e4e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: auto;
  padding: 12px 0;
}

/* -- Pipeline panel (above the canvas) -- */
.pipeline-panel {
  display: flex;
  gap: 6px;
  align-items: stretch;
  padding: 10px 16px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  margin-bottom: 12px;
  max-width: 100%;
  overflow-x: auto;
}
.phase-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1.5px solid rgba(0,0,0,0.06);
  background: #fafafa;
  min-width: 120px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  transition: border-color 0.2s, background 0.2s;
}
.phase-card.completed {
  border-color: rgba(42,122,42,0.25);
  background: rgba(42,122,42,0.04);
}
.phase-card.active {
  border-color: rgba(184,150,10,0.5);
  background: rgba(184,150,10,0.06);
  box-shadow: 0 0 0 2px rgba(184,150,10,0.15);
}
.phase-card.pending {
  opacity: 0.5;
}
.phase-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.phase-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.phase-dot.green { background: #2a7a2a; }
.phase-dot.amber { background: #b8960a; }
.phase-dot.gray  { background: #bbb; }
.phase-name {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}
.phase-agent {
  font-size: 10px;
  color: #888;
  font-family: 'Courier New', monospace;
}
.phase-time {
  font-size: 10px;
  color: #999;
  font-family: 'Courier New', monospace;
}

/* -- Canvas & overlay container -- */
#facility-container { position: relative; }
canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
#overlay-container {
  position: absolute; top: 0; left: 0;
  pointer-events: none;
}

/* -- Thought bubbles -- */
.thought-bubble {
  position: absolute;
  background: white;
  border: 2px solid #555;
  border-radius: 12px;
  padding: 6px 10px;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  color: #333;
  max-width: 240px;
  line-height: 1.3;
  box-shadow: 2px 2px 6px rgba(0,0,0,0.12);
  pointer-events: none;
  z-index: 10;
}
.thought-bubble::after {
  content: '';
  position: absolute;
  bottom: -10px; left: 20px;
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid #555;
}
.thought-bubble::before {
  content: '';
  position: absolute;
  bottom: -8px; left: 21px;
  width: 0; height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 9px solid white;
  z-index: 1;
}
.thought-bubble.fatal {
  border-color: #cc2222;
  background: #fff5f5;
}
.thought-bubble.fatal::after { border-top-color: #cc2222; }
.thought-bubble.fatal::before { border-top-color: #fff5f5; }
.thought-bubble .fatal-tag {
  background: #cc2222; color: white;
  padding: 1px 5px; border-radius: 3px;
  font-weight: bold; font-size: 10px;
  margin-right: 4px;
}

/* -- Time indicators -- */
.time-indicator {
  position: absolute;
  font-family: 'Courier New', monospace;
  font-size: 11px; font-weight: bold;
  padding: 2px 6px; border-radius: 4px;
  pointer-events: none; z-index: 10;
  letter-spacing: 0.5px;
}
.time-indicator.green {
  background: rgba(34,139,34,0.15);
  color: #228b22;
  border: 1px solid rgba(34,139,34,0.3);
}
.time-indicator.amber {
  background: rgba(204,153,0,0.15);
  color: #cc9900;
  border: 1px solid rgba(204,153,0,0.3);
}

/* -- Labels -- */
.room-label {
  position: absolute;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 10px;
  color: rgba(80,80,100,0.6);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  pointer-events: none; z-index: 10;
  font-weight: 600;
}
.agent-label {
  position: absolute;
  font-family: 'Courier New', monospace;
  font-size: 9px;
  color: rgba(60,60,80,0.7);
  text-align: center;
  pointer-events: none; z-index: 10;
  white-space: nowrap;
}

/* -- Findings whiteboard (HTML overlay in the workshop) -- */
.findings-whiteboard {
  position: absolute;
  background: rgba(255,255,255,0.95);
  border: 2px solid #888;
  border-radius: 4px;
  padding: 10px 14px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.7;
  color: #333;
  box-shadow: 2px 3px 8px rgba(0,0,0,0.1);
  pointer-events: none;
  z-index: 8;
  min-width: 220px;
}
.findings-whiteboard .wb-title {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #999;
  margin-bottom: 6px;
  font-weight: 600;
}
.findings-whiteboard .finding-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.findings-whiteboard .finding-dot {
  width: 7px; height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}
.finding-dot.done { background: #2a7a2a; }
.finding-dot.wip  { background: #b8960a; }
.finding-dot.new  { background: #cc4444; }
.finding-item.done-item {
  text-decoration: line-through;
  color: #999;
}
.finding-item .finding-status {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  margin-left: auto;
}
.finding-status.done  { background: rgba(42,122,42,0.12); color: #2a7a2a; }
.finding-status.wip   { background: rgba(184,150,10,0.12); color: #b8960a; }
.finding-status.new   { background: rgba(204,68,68,0.12); color: #cc4444; }

/* -- Control console display (governor's office) -- */
.console-display {
  position: absolute;
  background: rgba(30,30,50,0.92);
  color: #cdd6f4;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.6;
  padding: 10px 14px;
  border-radius: 6px;
  border: 2px solid #555;
  pointer-events: none;
  z-index: 10;
  white-space: pre;
  box-shadow: 0 0 12px rgba(30,30,50,0.3);
}
.console-display .console-label {
  color: #585b70;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.console-display .console-value {
  color: #a6e3a1;
}
.console-display .console-amber {
  color: #f9e2af;
}

/* -- Delivered artifacts (governor's office) -- */
.delivered-artifact {
  position: absolute;
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 3px;
  padding: 3px 8px;
  font-family: 'Courier New', monospace;
  font-size: 9px;
  color: #444;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
}
.delivered-artifact .check { color: #2a7a2a; margin-right: 3px; }
.delivered-artifact.blue   { border-color: rgba(51,102,153,0.3); color: #336699; }
.delivered-artifact.yellow { border-color: rgba(136,102,0,0.3); color: #886600; }
.delivered-artifact.red    { border-color: rgba(170,34,34,0.3); color: #aa2222; }
.delivered-artifact.green  { border-color: rgba(42,122,42,0.3); color: #2a7a2a; }

/* -- Action buttons (governor's office) -- */
.action-buttons {
  position: absolute;
  display: flex;
  gap: 8px;
  pointer-events: auto;
  z-index: 12;
}
.action-btn {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1.5px solid;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.action-btn.active {
  background: rgba(184,150,10,0.12);
  border-color: rgba(184,150,10,0.5);
  color: #8a7000;
}
.action-btn.active:hover {
  background: rgba(184,150,10,0.2);
}
.action-btn.disabled {
  background: rgba(0,0,0,0.03);
  border-color: rgba(0,0,0,0.1);
  color: #bbb;
  cursor: default;
}

/* -- Artifact objects (inline colored blocks) -- */
.artifact {
  position: absolute;
  width: 16px; height: 12px;
  border-radius: 2px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 5;
  transition: transform 0.15s;
}
.artifact:hover { transform: scale(1.3); }
.artifact.blue   { background: #4488cc; border: 1px solid #336699; }
.artifact.yellow { background: #ccaa22; border: 1px solid #aa8811; }
.artifact.red    { background: #cc4444; border: 1px solid #aa2222; }
.artifact-label {
  position: absolute;
  font-family: 'Courier New', monospace;
  font-size: 9px;
  color: #555;
  pointer-events: none; z-index: 10;
  white-space: nowrap;
  background: rgba(255,255,255,0.85);
  padding: 1px 4px;
  border-radius: 2px;
  border: 1px solid rgba(0,0,0,0.1);
}
.artifact-label.blue-label { color: #336699; border-color: rgba(51,102,153,0.2); }
.artifact-label.yellow-label { color: #886600; border-color: rgba(136,102,0,0.2); }

/* -- Artifact detail panel (modal) -- */
#artifact-panel {
  display: none;
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #fafafa;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 20px;
  max-width: 500px; width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  z-index: 1000;
  pointer-events: auto;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
#artifact-panel.visible { display: block; }
#artifact-backdrop {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 999;
  pointer-events: auto;
}
#artifact-backdrop.visible { display: block; }
#artifact-panel .close-btn {
  position: absolute; top: 8px; right: 12px;
  background: none; border: none;
  font-size: 20px; cursor: pointer;
  color: #666; padding: 4px 8px; line-height: 1;
}
#artifact-panel .close-btn:hover { color: #333; }
#artifact-panel h3 {
  font-size: 14px; color: #333;
  margin-bottom: 12px; padding-right: 30px;
}
#artifact-panel .severity-badge {
  display: inline-block;
  background: #cc2222; color: white;
  padding: 2px 8px; border-radius: 4px;
  font-weight: bold; font-size: 13px;
  margin-bottom: 8px;
}
#artifact-panel .finding {
  font-size: 13px; color: #333;
  margin: 8px 0; line-height: 1.5;
}
#artifact-panel .file-ref {
  font-family: 'Courier New', monospace;
  font-size: 12px; color: #4488cc;
  margin: 6px 0;
}
#artifact-panel .code-block {
  background: #1e1e2e; color: #cdd6f4;
  font-family: 'Courier New', monospace;
  font-size: 12px; padding: 12px;
  border-radius: 6px; margin-top: 10px;
  overflow-x: auto; line-height: 1.6;
  white-space: pre;
}
#artifact-panel .code-block .ln  { color: #585b70; user-select: none; margin-right: 12px; }
#artifact-panel .code-block .hl  {
  background: rgba(204,34,34,0.15);
  display: block; margin: 0 -12px; padding: 0 12px;
}
#artifact-panel .code-block .kw  { color: #cba6f7; }
#artifact-panel .code-block .str { color: #a6e3a1; }
#artifact-panel .code-block .cm  { color: #585b70; }
#artifact-panel .code-block .fn  { color: #f9e2af; }
</style>
</head>
<body>

<!-- ── Pipeline panel (above the canvas) ─────────────────────────── -->
<div class="pipeline-panel">
  <div class="phase-card completed">
    <div class="phase-card-header">
      <div class="phase-dot green"></div>
      <span class="phase-name">Architecture</span>
    </div>
    <span class="phase-agent">architect (Alex)</span>
    <span class="phase-time">2:30</span>
  </div>
  <div class="phase-card completed">
    <div class="phase-card-header">
      <div class="phase-dot green"></div>
      <span class="phase-name">Planning</span>
    </div>
    <span class="phase-agent">planner (Amelia)</span>
    <span class="phase-time">3:45</span>
  </div>
  <div class="phase-card completed">
    <div class="phase-card-header">
      <div class="phase-dot green"></div>
      <span class="phase-name">Implementation</span>
    </div>
    <span class="phase-agent">coder (Dan)</span>
    <span class="phase-time">5:12</span>
  </div>
  <div class="phase-card active">
    <div class="phase-card-header">
      <div class="phase-dot amber"></div>
      <span class="phase-name">Review (round 3/3)</span>
    </div>
    <span class="phase-agent">Bob, Ash, Rob</span>
    <span class="phase-time">1:55</span>
  </div>
  <div class="phase-card pending">
    <div class="phase-card-header">
      <div class="phase-dot gray"></div>
      <span class="phase-name">Summary</span>
    </div>
    <span class="phase-agent">orchestrator</span>
    <span class="phase-time">&mdash;</span>
  </div>
</div>

<!-- ── Canvas & overlay ───────────────────────────────────────────── -->
<div id="facility-container">
  <canvas id="facility-canvas"></canvas>
  <div id="overlay-container"></div>
</div>

<!-- ── Artifact detail panel ──────────────────────────────────────── -->
<div id="artifact-backdrop"></div>
<div id="artifact-panel">
  <button class="close-btn" id="close-btn">&times;</button>
  <h3>Review finding &mdash; Silent failure reviewer</h3>
  <div class="severity-badge">F &mdash; Fatal</div>
  <div class="finding">
    <strong>Missing null check on payment handler response</strong><br>
    The payment gateway response is destructured without checking for null/undefined.
    If the gateway times out or returns an error response, this will throw an unhandled
    TypeError at runtime, silently failing the transaction.
  </div>
  <div class="file-ref">src/payment/handler.ts:42</div>
  <div class="code-block"><span class="ln">40</span> <span class="kw">const</span> response = <span class="kw">await</span> <span class="fn">processPayment</span>(payload);
<span class="ln">41</span>
<span class="hl"><span class="ln">42</span> <span class="kw">const</span> { status, transactionId } = response.data; <span class="cm">// \u2190 no null check</span></span>
<span class="ln">43</span>
<span class="ln">44</span> <span class="kw">return</span> { status, transactionId };</div>
</div>

<script>
// -- TILESET DATA (embedded base64) --
const ASSETS = ${assetsJSON};

// -- CONSTANTS --
const T = 32;          // tile size in pixels
// On Retina (devicePixelRatio >= 2), SCALE=1 gives crisp 2x2 device pixels per game pixel.
// On non-Retina, SCALE=2 ensures pixels are visible.
const SCALE = window.devicePixelRatio >= 2 ? 1 : 2;
const ST = T * SCALE;  // scaled tile size for overlay positioning
const COLS = 40;       // canvas columns
const ROWS = 30;       // canvas rows
const CW = COLS * T;   // canvas width  = 1280
const CH = ROWS * T;   // canvas height = 960

// -- IMAGE LOADING --
function loadImage(dataURI) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURI;
  });
}

async function loadAllAssets() {
  const imgs = {};
  await Promise.all(
    Object.entries(ASSETS).map(async ([key, uri]) => {
      imgs[key] = await loadImage(uri);
    })
  );
  return imgs;
}

// region | DRAWING HELPERS
let ctx, images;

// Draw a 32x32 tile from a sprite sheet at tile position (dx, dy)
function drawSheetTile(sheetKey, sx, sy, dx, dy) {
  ctx.drawImage(images[sheetKey], sx, sy, T, T, dx * T, dy * T, T, T);
}

// Fill an area with a repeated 32x32 tile
function fillArea(sheetKey, sx, sy, x, y, w, h) {
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      drawSheetTile(sheetKey, sx, sy, x + c, y + r);
}

// Draw a furniture single (64x96 sprite) at tile position (tx, ty).
function drawSingle(singleKey, tx, ty) {
  ctx.drawImage(images[singleKey], 0, 0, 64, 96, tx * T, ty * T, 64, 96);
}

// Draw idle character at tile position.
// Idle sheets: 4 frames of 32x64 — directions: 0=down 1=left 2=right 3=up
function drawChar(charKey, direction, tx, ty) {
  const sx = direction * T;
  ctx.drawImage(images[charKey], sx, 0, T, 64, tx * T, ty * T, T, 64);
}

// endregion | DRAWING HELPERS

// -- ZONE DEFINITIONS (three-zone layout) --
const zones = {
  prep:     { x: 1,  y: 1,  w: 11, h: 12 },
  workshop: { x: 13, y: 1,  w: 26, h: 12 },
  governor: { x: 1,  y: 16, w: 38, h: 13 },
};

// -- MAIN FACILITY DRAWING --
function drawFacility() {
  // ─── 1. Fill canvas background (light warm gray = "outside") ───
  ctx.fillStyle = '#e8e4e0';
  ctx.fillRect(0, 0, CW, CH);

  // ─── 2. Draw gap floor between zones (slightly different shade) ──
  ctx.fillStyle = '#c8c5c0';
  // Horizontal gap between top zones and governor's office
  ctx.fillRect(1 * T, 13 * T, 38 * T, 3 * T);
  // Vertical gap between prep and workshop
  ctx.fillRect(12 * T, 1 * T, 1 * T, 12 * T);

  // ─── 2b. Doorway / corridor connecting upper zones to governor's office ──
  // 3-tile wide corridor through the gap + through the governor wall area
  fillArea('floors', 96, 0, 5, 13, 3, 5); // gap (3 tiles) + wall area (2 tiles)

  // ─── 3. Draw zone floors (cream tiles) ────────────────────────
  const z = zones;
  [z.prep, z.workshop, z.governor].forEach(r => {
    fillArea('floors', 96, 0, r.x, r.y + 2, r.w, r.h - 2);
  });

  // ─── 4. Draw walls (2 rows at top of each zone) ───────────────
  // Doorway gap: skip wall tiles at x=5..7 for the governor's office
  const doorX = 5, doorW = 3;
  function drawZoneWalls(zone, skipDoor) {
    for (let c = 0; c < zone.w; c++) {
      const tx = zone.x + c;
      if (skipDoor && tx >= doorX && tx < doorX + doorW) continue;
      drawSheetTile('walls', 32, 256, tx, zone.y);     // upper wall
      drawSheetTile('walls', 32, 288, tx, zone.y + 1); // baseboard
    }
  }
  drawZoneWalls(z.prep, false);
  drawZoneWalls(z.workshop, false);
  drawZoneWalls(z.governor, true);

  // ─── 5. Draw floor shadows at wall base ────────────────────────
  function drawWallShadow(zone, skipDoor) {
    for (let c = 0; c < zone.w; c++) {
      const tx = zone.x + c;
      if (skipDoor && tx >= doorX && tx < doorX + doorW) continue;
      drawSheetTile('floorShadows', 0, 0, tx, zone.y + 2);
    }
  }
  drawWallShadow(z.prep, false);
  drawWallShadow(z.workshop, false);
  drawWallShadow(z.governor, true);

  // ─── 6. Draw subtle zone border lines ────────────────────────
  ctx.strokeStyle = 'rgba(60,60,80,0.3)';
  ctx.lineWidth = 1;
  [z.prep, z.workshop, z.governor].forEach(r => {
    ctx.strokeRect(r.x * T + 0.5, r.y * T + 0.5, r.w * T - 1, r.h * T - 1);
  });

  // ═════════════════════════════════════════════════════════════════
  // 7. FURNITURE — PREP AREA (architect + planner)
  // ═════════════════════════════════════════════════════════════════

  // Architect's area (left side of prep)
  drawSingle('analysisBoard172', 2, 0);     // analysis board on wall
  drawSingle('desk180', 2, 4);              // architect's desk
  drawSingle('deskLamp145', 4, 4);          // desk lamp

  // Planner's area (right side of prep)
  drawSingle('whiteboard170', 7, 0);        // whiteboard on wall
  drawSingle('desk180', 7, 4);              // planner's desk

  // Atmosphere: plant, certificate
  drawSingle('plant100', 1, 1);             // plant in left corner (on wall line)
  drawSingle('cert115', 10, 0);             // certificate on wall
  drawSingle('trashCan119', 10, 10);        // trash can

  // Chairs behind desks
  drawSingle('chairBack105', 3, 7);
  drawSingle('chairBack105', 8, 7);

  // ═════════════════════════════════════════════════════════════════
  // 8. FURNITURE — WORKSHOP (coder + 3 reviewers + whiteboard zone)
  // ═════════════════════════════════════════════════════════════════

  // Coder station (left side of workshop)
  drawSingle('coderPC227', 15, 1);          // desktop PC on wall
  drawSingle('desk180', 15, 4);             // coder's desk
  drawSingle('deskLamp145', 17, 4);         // desk lamp

  // Whiteboard area: clear space between coder and reviewers for HTML overlay
  // (approximately tiles 22-30, y 2-8 — left clear for the HTML whiteboard)

  // Reviewer 1 (Bob — code reviewer) — left reviewer
  drawSingle('reviewMonitor133', 21, 7);    // monitor on desk
  drawSingle('desk180', 21, 9);             // reviewer desk

  // Reviewer 2 (Ash — silent failure) — middle reviewer
  drawSingle('reviewMonitor133', 27, 7);    // monitor on desk
  drawSingle('desk180', 27, 9);             // reviewer desk

  // Reviewer 3 (Rob — test reviewer) — right reviewer
  drawSingle('reviewMonitor133', 33, 7);    // monitor on desk
  drawSingle('desk180', 33, 9);             // reviewer desk

  // Workshop atmosphere
  drawSingle('plant100', 13, 1);            // plant in left corner (on wall line)
  drawSingle('bush339', 37, 1);             // bush in right corner (on wall line)
  drawSingle('cert115', 18, 0);             // certificate on wall
  drawSingle('wallPainting161', 30, 0);     // painting on wall (between reviewers)
  drawSingle('trashCan119', 37, 10);        // trash can in corner

  // ═════════════════════════════════════════════════════════════════
  // 9. FURNITURE — GOVERNOR'S OFFICE
  // ═════════════════════════════════════════════════════════════════

  // Orchestrator's desk area (left side)
  drawSingle('monitor130', 4, 16);          // orchestrator's monitor
  drawSingle('desk180', 4, 18);             // orchestrator's desk
  drawSingle('deskLamp145', 6, 18);         // desk lamp

  // Delivery table (multiple desk segments, center-left area)
  drawSingle('desk180', 12, 18);
  drawSingle('desk180', 14, 18);
  drawSingle('desk180', 16, 18);
  drawSingle('desk180', 18, 18);
  drawSingle('desk180', 20, 18);

  // Control console area (right side)
  drawSingle('serverRack175', 28, 16);      // server rack
  drawSingle('dataDashboard174', 30, 16);   // data dashboard
  drawSingle('mainframe176', 32, 16);       // mainframe

  // Additional monitors for timeline and cost displays
  drawSingle('dashChart171', 34, 16);       // timeline/chart display on wall
  drawSingle('desk180', 26, 18);            // desk for terminal
  drawSingle('smallMonitor136', 26, 18);    // terminal display on desk

  // Atmosphere
  drawSingle('plant100', 1, 16);            // plant in left corner (on wall line)
  drawSingle('plant100', 37, 16);           // plant in right corner (on wall line)
  drawSingle('cabinet260', 1, 20);          // filing cabinet
  drawSingle('wallPainting163', 8, 15);     // painting on wall
  drawSingle('cert115', 22, 15);            // certificate on wall
  drawSingle('bookshelf200', 37, 20);       // bookshelf
  drawSingle('trashCan119', 7, 25);         // trash can
  drawSingle('waterCooler320', 37, 25);     // water cooler in corner

  // ═════════════════════════════════════════════════════════════════
  // 10. CHARACTERS
  // ═════════════════════════════════════════════════════════════════

  // Orchestrator (Adam) — facing down (toward camera), at desk in governor's office
  drawChar('adamIdle', 0, 5, 20);

  // Architect (Alex) — facing up (toward analysis board), in prep area
  drawChar('alexIdle', 3, 3, 5);

  // Planner (Amelia) — facing up (toward whiteboard), in prep area
  drawChar('ameliaIdle', 3, 8, 5);

  // Coder (Dan) — facing up (toward PC), in workshop
  drawChar('danIdle', 3, 16, 5);

  // Reviewer 1 — Bob (code reviewer) — facing up toward monitor
  drawChar('bobIdle', 3, 22, 10);

  // Reviewer 2 — Ash (silent failure) — facing up toward monitor
  drawChar('ashIdle', 3, 28, 10);

  // Reviewer 3 — Rob (test reviewer) — facing up toward monitor
  drawChar('robIdle', 3, 34, 10);
}

// -- HTML OVERLAYS --
function createOverlays() {
  const container = document.getElementById('overlay-container');
  container.style.width = (CW * SCALE) + 'px';
  container.style.height = (CH * SCALE) + 'px';

  // ── Zone labels ──────────────────────────────────────────────
  addLabel(container, 'PREP AREA',          4,    0.3,  'room-label');
  addLabel(container, 'THE WORKSHOP',       22,   0.3,  'room-label');
  addLabel(container, "GOVERNOR'S OFFICE",  15,   15.3, 'room-label');

  // ── Agent labels ─────────────────────────────────────────────
  addLabel(container, 'architect',        2.5,  8.5, 'agent-label');
  addLabel(container, 'planner',          7.5,  8.5, 'agent-label');
  addLabel(container, 'coder',            15.5, 8.5, 'agent-label');
  addLabel(container, 'code-reviewer',    21,   12.5, 'agent-label');
  addLabel(container, 'silent-failure',   27,   12.5, 'agent-label');
  addLabel(container, 'test-reviewer',    33,   12.5, 'agent-label');
  addLabel(container, 'orchestrator',     4,    24,   'agent-label');

  // ── Thought bubbles ──────────────────────────────────────────
  // Orchestrator: monitoring
  addBubble(container,
    'All 3 reviewers active. Waiting for findings\u2026',
    0.5, 17.5, '');
  // Architect: completed
  addBubble(container,
    'Assessed impact: <b>medium</b>. 4 files, 2 modules.',
    0.5, -0.5, '');
  // Planner: completed
  addBubble(container,
    '5 steps planned. Est. ~200 lines changed.',
    6.5, -0.5, '');
  // Coder: working
  addBubble(container,
    '<span style="color:#4488cc">+142</span> ' +
    '<span style="color:#cc4444">-38</span> across 4 files',
    14, -0.5, '');
  // Code reviewer (Bob): warning finding
  addBubble(container,
    'Found <b style="color:#cc9900">W</b>: unbounded array growth in queue.ts',
    19, 7, '');
  // Silent failure reviewer (Ash): critical finding
  addBubble(container,
    '<span class="fatal-tag">FATAL</span> Missing null check in handler.ts:42',
    25, 7, 'fatal');
  // Test reviewer (Rob): good news
  addBubble(container,
    '<span style="color:#228b22">\u2713</span> All 12 test cases pass. Coverage 94%.',
    31, 7, '');

  // ── Time indicators ──────────────────────────────────────────
  addTime(container, '\u23f1 2:30', 2.5, 9.5, 'green');   // architect
  addTime(container, '\u23f1 3:45', 7.5, 9.5, 'green');   // planner
  addTime(container, '\u23f1 5:12', 15.5, 9.5, 'amber');  // coder
  addTime(container, '\u23f1 1:24', 21, 12.8, 'green');   // Bob
  addTime(container, '\u23f1 2:08', 27, 12.8, 'green');   // Ash
  addTime(container, '\u23f1 1:55', 33, 12.8, 'green');   // Rob

  // ── Findings whiteboard (HTML overlay in the workshop) ───────
  const wb = document.createElement('div');
  wb.className = 'findings-whiteboard';
  wb.innerHTML =
    '<div class="wb-title">Findings</div>' +
    '<div class="finding-item done-item">' +
      '<div class="finding-dot done"></div>' +
      '<span>Missing null check in handler.ts</span>' +
      '<span class="finding-status done">done</span>' +
    '</div>' +
    '<div class="finding-item">' +
      '<div class="finding-dot wip"></div>' +
      '<span>Unbounded array growth in queue.ts</span>' +
      '<span class="finding-status wip">in progress</span>' +
    '</div>' +
    '<div class="finding-item">' +
      '<div class="finding-dot new"></div>' +
      '<span>Test coverage below threshold</span>' +
      '<span class="finding-status new">new</span>' +
    '</div>';
  wb.style.left = (21 * ST) + 'px';
  wb.style.top  = (2 * ST) + 'px';
  container.appendChild(wb);

  // ── Artifacts at workstations ────────────────────────────────
  // Prep area artifacts
  addArtifact(container, 3, 5.5, 'blue', 'architecture-assessment.md');
  addArtifactLabel(container, 'architecture-assessment.md', 1, 5, 'blue-label');
  addArtifact(container, 8, 5.5, 'blue', 'implementation-plan.md');
  addArtifactLabel(container, 'implementation-plan.md', 6, 5, 'blue-label');

  // Coder artifacts
  addArtifact(container, 16, 5.5, 'yellow', 'change-summary.md');
  addArtifactLabel(container, 'change-summary.md', 14.5, 5, 'yellow-label');

  // ── Control console display (governor's office) ──────────────
  const console_display = document.createElement('div');
  console_display.className = 'console-display';
  console_display.innerHTML =
    '<span class="console-label">run metrics</span>\n' +
    'Run:      <span class="console-value">feat-payment-validation</span>\n' +
    'Duration: <span class="console-amber">14:22</span>\n' +
    'Tokens:   <span class="console-value">47.2k</span>\n' +
    'Cost:     <span class="console-value">$0.38</span>';
  console_display.style.left = (28 * ST) + 'px';
  console_display.style.top  = (19.5 * ST) + 'px';
  container.appendChild(console_display);

  // ── Delivered artifacts (governor's office, on the delivery table) ──
  addDelivered(container, '\u2713 architecture-assessment.md', 12, 20.2, 'blue');
  addDelivered(container, '\u2713 implementation-plan.md',     12, 20.8, 'blue');
  addDelivered(container, '\u2713 change-summary.md',         16, 20.2, 'yellow');
  addDelivered(container, '\u2713 commit: feat(payment)',     16, 20.8, 'yellow');
  addDelivered(container, '\u25CF code-review.md',            20, 20.2, 'red');
  addDelivered(container, '\u25CF silent-failure-review.md',  20, 20.8, 'red');
  addDelivered(container, '\u25CF test-review.md',            20, 21.4, 'red');

  // ── Action buttons (governor's office) ───────────────────────
  const btnContainer = document.createElement('div');
  btnContainer.className = 'action-buttons';
  btnContainer.style.left = (4 * ST) + 'px';
  btnContainer.style.top  = (26 * ST) + 'px';

  const btnWrapUp = document.createElement('button');
  btnWrapUp.className = 'action-btn active';
  btnWrapUp.textContent = 'Run wrap-up';
  btnContainer.appendChild(btnWrapUp);

  const btnPush = document.createElement('button');
  btnPush.className = 'action-btn disabled';
  btnPush.textContent = 'Push to remote';
  btnContainer.appendChild(btnPush);

  const btnPR = document.createElement('button');
  btnPR.className = 'action-btn disabled';
  btnPR.textContent = 'Create PR';
  btnContainer.appendChild(btnPR);

  container.appendChild(btnContainer);
}

// ── Helper functions ───────────────────────────────────────────
function addBubble(container, html, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'thought-bubble' + (cls ? ' ' + cls : '');
  el.innerHTML = html;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  container.appendChild(el);
}

function addTime(container, text, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'time-indicator ' + cls;
  el.textContent = text;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  container.appendChild(el);
}

function addLabel(container, text, x, y, cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  container.appendChild(el);
}

function addDelivered(container, text, x, y, color) {
  const el = document.createElement('div');
  el.className = 'delivered-artifact ' + color;
  el.innerHTML = text;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  container.appendChild(el);
}

function addArtifactLabel(container, text, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'artifact-label ' + (cls || '');
  el.textContent = text;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  container.appendChild(el);
}

function addArtifact(container, x, y, cls, title, clickable) {
  const el = document.createElement('div');
  el.className = 'artifact ' + cls;
  el.title = title;
  el.style.left = (x * ST) + 'px';
  el.style.top  = (y * ST) + 'px';
  if (clickable) el.addEventListener('click', openArtifactPanel);
  container.appendChild(el);
}

// -- ARTIFACT PANEL INTERACTION --
function openArtifactPanel() {
  document.getElementById('artifact-panel').classList.add('visible');
  document.getElementById('artifact-backdrop').classList.add('visible');
}
function closeArtifactPanel() {
  document.getElementById('artifact-panel').classList.remove('visible');
  document.getElementById('artifact-backdrop').classList.remove('visible');
}
document.getElementById('artifact-backdrop').addEventListener('click', closeArtifactPanel);
document.getElementById('close-btn').addEventListener('click', closeArtifactPanel);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeArtifactPanel();
});

// -- INITIALIZATION --
async function init() {
  const canvas = document.getElementById('facility-canvas');
  canvas.width  = CW;
  canvas.height = CH;
  canvas.style.width  = (CW * SCALE) + 'px';
  canvas.style.height = (CH * SCALE) + 'px';
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  try {
    images = await loadAllAssets();
    drawFacility();
  } catch (err) {
    console.error('Failed to load tileset assets:', err);
    // Fallback: draw colored rectangles for zones
    ctx.fillStyle = '#e8e4e0';
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#d0ccc8';
    const allZones = [zones.prep, zones.workshop, zones.governor];
    allZones.forEach(r => {
      ctx.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
    });
    ctx.fillStyle = '#bbb8b4';
    ctx.fillRect(1*T, 10*T, 28*T, 2*T);
  }
  createOverlays();
}

init();
<` +
    `/script>
</body>
</html>`
  );
}
