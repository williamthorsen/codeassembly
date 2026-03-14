#!/usr/bin/env node
/**
 * Builds the prototype-tilemap-facility.html file by embedding tileset PNGs as base64 data URIs.
 * Run: node build-prototype.js
 */
const fs = require('fs');
const path = require('path');

const TILESET_BASE = '/Users/william/Library/Mobile Documents/com~apple~CloudDocs/Resources/Tilesets';

const assetPaths = {
  officeRoomBuilder: `${TILESET_BASE}/Modern_Office_Revamped_v1.2/1_Room_Builder_Office/Room_Builder_Office_32x32.png`,
  officeSheet: `${TILESET_BASE}/Modern_Office_Revamped_v1.2/Modern_Office_32x32.png`,
  conferenceHall: `${TILESET_BASE}/moderninteriors-win/1_Interiors/32x32/Theme_Sorter_32x32/13_Conference_Hall_32x32.png`,
  walls: `${TILESET_BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Walls_32x32.png`,
  floors: `${TILESET_BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Floors_32x32.png`,
  floorShadows: `${TILESET_BASE}/moderninteriors-win/1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Floor_Shadows_32x32.png`,
  adamSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Adam_sit_32x32.png`,
  alexSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Alex_sit_32x32.png`,
  ameliaSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Amelia_sit_32x32.png`,
  bobSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Bob_sit_32x32.png`,
  ashSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Ash_sit_32x32.png`,
  danSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Dan_sit_32x32.png`,
  lucySit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Lucy_sit_32x32.png`,
  robSit: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Rob_sit_32x32.png`,
  adamIdle: `${TILESET_BASE}/moderninteriors-win/2_Characters/Old/Single_Characters_Legacy/32x32/Adam_idle_32x32.png`,
};

// Build base64 data URIs
const assets = {};
let totalBytes = 0;
for (const [key, filePath] of Object.entries(assetPaths)) {
  const buf = fs.readFileSync(filePath);
  assets[key] = 'data:image/png;base64,' + buf.toString('base64');
  totalBytes += buf.length;
  console.log(`  ${key}: ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`Total asset data: ${(totalBytes / 1024).toFixed(0)} KB`);

// Build the HTML
const html = buildHTML(JSON.stringify(assets));
const outPath = path.join(__dirname, 'prototype-tilemap-facility.html');
fs.writeFileSync(outPath, html);
console.log(`Written: ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);

function buildHTML(assetsJSON) {
  return (
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeAssembly - Tech facility prototype</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: auto;
}
#facility-container { position: relative; margin: 12px 0; }
canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
#overlay-container {
  position: absolute; top: 0; left: 0;
  pointer-events: none;
}

/* Thought bubbles */
.thought-bubble {
  position: absolute;
  background: white;
  border: 2px solid #555;
  border-radius: 12px;
  padding: 6px 10px;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  color: #333;
  max-width: 220px;
  line-height: 1.3;
  box-shadow: 2px 2px 4px rgba(0,0,0,0.15);
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

/* Time indicators */
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

/* Clickable artifact objects */
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
.artifact.blue { background: #4488cc; border: 1px solid #336699; }
.artifact.yellow { background: #ccaa22; border: 1px solid #aa8811; }
.artifact.red { background: #cc4444; border: 1px solid #aa2222; }
.artifact.clickable {
  animation: glow 1.5s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(204,68,68,0.6);
  width: 20px; height: 14px;
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 4px rgba(204,68,68,0.4); }
  50% { box-shadow: 0 0 10px rgba(204,68,68,0.8); }
}

/* Labels */
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
.click-hint {
  position: absolute;
  font-size: 9px;
  color: rgba(204,68,68,0.8);
  font-family: 'Courier New', monospace;
  pointer-events: none; z-index: 10;
  animation: hintPulse 2s ease-in-out infinite;
}
@keyframes hintPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Artifact detail panel */
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
#artifact-panel .code-block .ln { color: #585b70; user-select: none; margin-right: 12px; }
#artifact-panel .code-block .hl {
  background: rgba(204,34,34,0.15);
  display: block; margin: 0 -12px; padding: 0 12px;
}
#artifact-panel .code-block .kw { color: #cba6f7; }
#artifact-panel .code-block .str { color: #a6e3a1; }
#artifact-panel .code-block .cm { color: #585b70; }
#artifact-panel .code-block .fn { color: #f9e2af; }

/* Header and pipeline bar */
.facility-header {
  color: #a0a0c0; font-size: 12px;
  margin-top: 12px;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}
.facility-header span { color: #6a6a9a; }
.pipeline-bar {
  display: flex; gap: 4px;
  margin-top: 8px; margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
}
.pipeline-phase {
  font-family: 'Courier New', monospace;
  font-size: 10px; padding: 3px 10px;
  border-radius: 3px; color: #888;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
}
.pipeline-phase.completed {
  color: #5a9a5a;
  background: rgba(90,154,90,0.1);
  border-color: rgba(90,154,90,0.2);
}
.pipeline-phase.active {
  color: #ccaa22;
  background: rgba(204,170,34,0.1);
  border-color: rgba(204,170,34,0.3);
  font-weight: bold;
}
.pipeline-phase.pending { color: #555; }
</style>
</head>
<body>

<div class="facility-header">
  CODEASSEMBLY <span>|</span> run-2024-0312-a <span>|</span> #feat-payment-validation <span>|</span> REVIEW PHASE
</div>

<div id="facility-container">
  <canvas id="facility-canvas"></canvas>
  <div id="overlay-container"></div>
</div>

<div class="pipeline-bar">
  <div class="pipeline-phase completed">architecture</div>
  <div class="pipeline-phase completed">planning</div>
  <div class="pipeline-phase completed">implementation</div>
  <div class="pipeline-phase active">review (3/3)</div>
  <div class="pipeline-phase pending">summary</div>
</div>

<!-- Artifact detail panel -->
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
<span class="hl"><span class="ln">42</span> <span class="kw">const</span> { status, transactionId } = response.data; <span class="cm">// \\u2190 no null check</span></span>
<span class="ln">43</span>
<span class="ln">44</span> <span class="kw">return</span> { status, transactionId };</div>
</div>

<script>
// ============================================================
// TILESET DATA (embedded base64)
// ============================================================
const ASSETS = ${assetsJSON};

// ============================================================
// CONSTANTS
// ============================================================
const T = 32;          // tile size
const SCALE = 2;       // render scale
const ST = T * SCALE;  // scaled tile size (for overlay positioning)
const COLS = 30;
const ROWS = 22;
const CW = COLS * T;   // canvas width (960)
const CH = ROWS * T;   // canvas height (704)

// ============================================================
// IMAGE LOADING
// ============================================================
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

// ============================================================
// DRAWING HELPERS
// ============================================================
let ctx, images;

function drawTile(sheet, sx, sy, dx, dy, sw, sh, dw, dh) {
  sw = sw || T; sh = sh || T; dw = dw || T; dh = dh || T;
  ctx.drawImage(images[sheet], sx, sy, sw, sh, dx, dy, dw, dh);
}

function fillArea(sheet, sx, sy, x, y, w, h) {
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      drawTile(sheet, sx, sy, (x + c) * T, (y + r) * T);
}

/** Draw a character from their sit sprite sheet. direction: 0=down 1=left 2=right 3=up */
function drawSittingChar(charSheet, direction, dx, dy) {
  const sx = direction * 6 * T; // 6 animation frames per direction
  drawTile(charSheet, sx, 0, dx, dy, T, 64, T, 64);
}

/** Draw a character from their idle sprite sheet. direction: 0=down 1=left 2=right 3=up */
function drawIdleChar(charSheet, direction, dx, dy) {
  const sx = direction * T;
  drawTile(charSheet, sx, 0, dx, dy, T, 64, T, 64);
}

// ============================================================
// ROOM DEFINITIONS (tile coordinates)
// ============================================================
const rooms = {
  control:  { x: 11, y: 1,  w: 9,  h: 7 },
  analysis: { x: 1,  y: 1,  w: 9,  h: 7 },
  coder:    { x: 1,  y: 11, w: 9,  h: 9 },
  review:   { x: 17, y: 11, w: 12, h: 9 },
};

// ============================================================
// MAIN FACILITY DRAWING
// ============================================================
function drawFacility() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CW, CH);

  // ============================================================
  // FLOORS
  // ============================================================
  // Floors tileset: 480x1280 = 15 cols x 40 rows (32px tiles)
  // 5 floor-theme columns, each 3 tiles wide:
  //   Col 0 (x=0):    light blue/purple grid
  //   Col 1 (x=96):   cream/beige
  //   Col 2 (x=192):  red/terracotta
  //   Col 3 (x=288):  gray/slate
  //   Col 4 (x=384):  dark wood/stone

  // Upper rooms: light cream (col 1)
  fillArea('floors', 96, 0, rooms.control.x, rooms.control.y + 2, rooms.control.w, rooms.control.h - 2);
  fillArea('floors', 96, 0, rooms.analysis.x, rooms.analysis.y + 2, rooms.analysis.w, rooms.analysis.h - 2);

  // Lower rooms: slightly different cream shade (col 1, row offset)
  fillArea('floors', 96, 96, rooms.coder.x, rooms.coder.y + 2, rooms.coder.w, rooms.coder.h - 2);
  fillArea('floors', 96, 96, rooms.review.x, rooms.review.y + 2, rooms.review.w, rooms.review.h - 2);

  // Corridors: gray (col 3)
  // Horizontal corridor
  fillArea('floors', 288, 0, 10, 8, 8, 3);
  // Vertical corridor segments
  fillArea('floors', 288, 0, 10, 1, 1, 20);
  fillArea('floors', 288, 0, 16, 8, 1, 4);

  // ============================================================
  // WALLS
  // ============================================================
  // Office Room Builder: 512x448 = 16 cols x 14 rows
  // The wall+floor combos start around row 3-4:
  //   y=96-127 (row 3):  Light lavender upper wall
  //   y=128-159 (row 4): Light lavender lower wall / baseboard
  //   y=160-191 (row 5): Gray upper wall
  //   y=192-223 (row 6): Gray lower wall
  //   y=224-255 (row 7): Brick upper
  //   y=256-287 (row 8): Brick lower

  // Upper rooms: lavender walls
  function drawRoomWalls(room, wallTopY) {
    for (let c = 0; c < room.w; c++) {
      drawTile('officeRoomBuilder', 0, wallTopY, (room.x + c) * T, room.y * T);
      drawTile('officeRoomBuilder', 0, wallTopY + T, (room.x + c) * T, (room.y + 1) * T);
    }
  }
  drawRoomWalls(rooms.control, 96);
  drawRoomWalls(rooms.analysis, 96);
  drawRoomWalls(rooms.coder, 160);
  drawRoomWalls(rooms.review, 160);

  // Room border lines
  ctx.strokeStyle = '#3a3a5a';
  ctx.lineWidth = 2;
  [rooms.control, rooms.analysis, rooms.coder, rooms.review].forEach(r => {
    ctx.strokeRect(r.x * T, r.y * T, r.w * T, r.h * T);
  });

  // Doorway openings (clear wall lines)
  function clearDoor(x, y, w, h) {
    // Draw corridor floor over the wall line
    fillArea('floors', 288, 0, x, y, w, h);
  }
  // Analysis room -> corridor (right wall gap)
  clearDoor(10, 5, 1, 2);
  // Control room -> corridor (bottom wall gap)
  clearDoor(14, 8, 2, 1);
  // Coder -> corridor (right wall gap)
  clearDoor(10, 14, 1, 2);
  // Review <- corridor (left wall gap)
  clearDoor(16, 14, 1, 2);

  // ============================================================
  // FURNITURE (from Modern_Office_32x32.png, 512x1696 = 16x53 tiles)
  // ============================================================
  //
  // Key tile coordinates identified by visual inspection:
  //
  // Cubicle desks (beige partitions): rows 0-1 (y=0-63), various widths
  //   - 2-wide desk panel: (0,0) to (63,63) = 2x2 tiles
  //
  // White/lavender desks: rows 4-5 (y=128-191)
  //   - Light table: (0,128) to (63,191) = 2x2 tiles
  //
  // Chairs: row 7 (y=224)
  //   - Navy office chairs at x=0..128, each 32x32
  //   - Plants at x=128..160
  //   - Laptop at x=160
  //   - Monitors at x=192..320 (various)
  //   - Dual/wide monitors at x=352..480
  //
  // Brown leather chairs: row 8 (y=256)
  //
  // Pictures/art: row 9-10 (y=288-351)
  //   - Framed art: various sizes at (0,288)..(192,351)
  //   - Bookshelf: (224,352) approx 2x2
  //
  // Whiteboard/chart: row 12 (y=384)
  //   - Large graph/chart display: (224,384) 2x2 area
  //
  // Couches/sofas: rows 13-14 (y=416-479)
  //
  // Filing cabinets: rows 15-19 (y=480-639)
  //
  // Printers: row 20 (y=640)
  //
  // Glass partitions: row 23-24 (y=736-799)
  //
  // Long desks/tables: row 25+ (y=800+)

  // ---- CONTROL ROOM ----

  // Large display/whiteboard on back wall
  // Conference hall has various items; the whiteboard/screen is in the top area
  // conferenceHall: 512x384 = 16x12 tiles
  // From visual: top row has lights/lamps, then chairs, then podium, then table area
  // The large table/conference surface appears around row 8-10 (y=256-352)
  // The whiteboard is at roughly (128,256) as a large white rectangle
  // Let me use the graph/chart display from office sheet instead
  drawTile('officeSheet', 224, 384, 13 * T, 1 * T, 64, 64, 64, 64);

  // A smaller display next to it
  drawTile('officeSheet', 352, 384, 16 * T, 1 * T, 64, 64, 64, 64);

  // Orchestrator's desk (long table)
  drawTile('officeSheet', 0, 128, 13 * T, 5 * T);
  drawTile('officeSheet', 32, 128, 14 * T, 5 * T);
  drawTile('officeSheet', 64, 128, 15 * T, 5 * T);
  drawTile('officeSheet', 0, 160, 13 * T, 6 * T);
  drawTile('officeSheet', 32, 160, 14 * T, 6 * T);
  drawTile('officeSheet', 64, 160, 15 * T, 6 * T);

  // Monitors on control desk
  drawTile('officeSheet', 352, 224, 13 * T, 4 * T);
  drawTile('officeSheet', 416, 224, 15 * T, 4 * T);

  // ---- ANALYSIS LAB ----

  // Architect's desk (left)
  drawTile('officeSheet', 0, 0, 2 * T, 4 * T);
  drawTile('officeSheet', T, 0, 3 * T, 4 * T);
  drawTile('officeSheet', 0, T, 2 * T, 5 * T);
  drawTile('officeSheet', T, T, 3 * T, 5 * T);
  drawTile('officeSheet', 352, 224, 2 * T, 3 * T); // monitor

  // Planner's desk (right)
  drawTile('officeSheet', 0, 0, 6 * T, 4 * T);
  drawTile('officeSheet', T, 0, 7 * T, 4 * T);
  drawTile('officeSheet', 0, T, 6 * T, 5 * T);
  drawTile('officeSheet', T, T, 7 * T, 5 * T);
  drawTile('officeSheet', 352, 224, 6 * T, 3 * T); // monitor

  // Bookshelf on back wall
  drawTile('officeSheet', 224, 352, 8 * T, 1 * T, 64, 64, 64, 64);

  // Plant
  drawTile('officeSheet', 128, 224, 1 * T, 2 * T);

  // ---- CODER'S WORKSHOP ----

  // Main desk (3 wide)
  for (let i = 0; i < 3; i++) {
    drawTile('officeSheet', i * T, 0, (3 + i) * T, 15 * T);
    drawTile('officeSheet', i * T, T, (3 + i) * T, 16 * T);
  }
  // Triple monitors
  drawTile('officeSheet', 352, 224, 3 * T, 14 * T);
  drawTile('officeSheet', 416, 224, 4 * T, 14 * T);
  drawTile('officeSheet', 352, 224, 5 * T, 14 * T);

  // Side equipment table
  drawTile('officeSheet', 0, 128, 7 * T, 15 * T);
  drawTile('officeSheet', T, 128, 8 * T, 15 * T);

  // Plant
  drawTile('officeSheet', 128, 224, 8 * T, 12 * T);

  // ---- REVIEW BAY ----

  // 3 reviewer desks
  const reviewDesks = [18, 22, 26]; // x-positions
  reviewDesks.forEach(dx => {
    drawTile('officeSheet', 0, 0, dx * T, 15 * T);
    drawTile('officeSheet', T, 0, (dx + 1) * T, 15 * T);
    drawTile('officeSheet', 0, T, dx * T, 16 * T);
    drawTile('officeSheet', T, T, (dx + 1) * T, 16 * T);
    drawTile('officeSheet', 352, 224, dx * T, 14 * T); // monitor
  });

  // Plants
  drawTile('officeSheet', 128, 224, 17 * T, 12 * T);
  drawTile('officeSheet', 128, 224, 28 * T, 12 * T);

  // ---- CHAIRS ----
  // Office chairs from row 7 (y=224)
  // Facing down: x=0, Facing up: probably x=32 or x=64
  // From the image the chairs at x=0 face down, x=32 might be a side view
  // Let me use x=0 for simplicity (facing down = toward camera)

  // Analysis chairs
  drawTile('officeSheet', 0, 224, 3 * T, 6 * T);  // architect
  drawTile('officeSheet', 0, 224, 7 * T, 6 * T);  // planner

  // Coder chair
  drawTile('officeSheet', 0, 224, 4 * T, 17 * T);

  // Reviewer chairs
  drawTile('officeSheet', 0, 224, 19 * T, 17 * T);
  drawTile('officeSheet', 0, 224, 23 * T, 17 * T);
  drawTile('officeSheet', 0, 224, 27 * T, 17 * T);

  // ============================================================
  // CHARACTERS
  // ============================================================

  // Orchestrator (Adam) - standing idle, facing down
  drawIdleChar('adamIdle', 0, 14 * T, 3 * T);

  // Architect (Alex) - sitting, facing up toward monitor
  drawSittingChar('alexSit', 3, 3 * T, 5 * T);

  // Planner (Amelia) - sitting, facing up
  drawSittingChar('ameliaSit', 3, 7 * T, 5 * T);

  // Coder (Dan) - sitting, facing up
  drawSittingChar('danSit', 3, 4 * T, 16 * T);

  // Reviewer 1 - code reviewer (Bob) - sitting, facing up
  drawSittingChar('bobSit', 3, 19 * T, 16 * T);

  // Reviewer 2 - silent failure reviewer (Ash) - sitting, facing up
  drawSittingChar('ashSit', 3, 23 * T, 16 * T);

  // Reviewer 3 - test reviewer (Rob) - sitting, facing up
  drawSittingChar('robSit', 3, 27 * T, 16 * T);

  // ============================================================
  // FLOOR SHADOWS (subtle depth at wall/floor transition)
  // ============================================================
  // Floor shadows tileset: 512x160 = 16x5 tiles
  // Contains shadow tiles to place at the base of walls for depth
  // Row 0 has basic shadow strips

  // Apply shadow at wall base for each room
  function drawWallShadow(room) {
    for (let c = 0; c < room.w; c++) {
      drawTile('floorShadows', 0, 0, (room.x + c) * T, (room.y + 2) * T);
    }
  }
  drawWallShadow(rooms.control);
  drawWallShadow(rooms.analysis);
  drawWallShadow(rooms.coder);
  drawWallShadow(rooms.review);
}

// ============================================================
// HTML OVERLAYS
// ============================================================
function createOverlays() {
  const container = document.getElementById('overlay-container');
  container.style.width = (CW * SCALE) + 'px';
  container.style.height = (CH * SCALE) + 'px';

  // Thought bubbles
  addBubble(container, 'Checking error handling patterns...', 1.5, 1.2, '');
  addBubble(container, '<span style="color:#4488cc">+142</span> <span style="color:#cc4444">-38</span> across 4 files', 4.5, 12, '');
  addBubble(container, '<span class="fatal-tag">FATAL</span> Missing null check in handler.ts', 21, 11.5, 'fatal');
  addBubble(container, 'Found <b style="color:#cc9900">W</b>: unbounded array growth', 17.5, 13.5, '');

  // Time indicators
  addTime(container, '2:30', 3.2, 7.5, 'green');
  addTime(container, '3:45', 7.2, 7.5, 'green');
  addTime(container, '5:12', 3.5, 19.2, 'amber');
  addTime(container, '1:24', 19, 19, 'green');
  addTime(container, '2:08', 23, 19, 'green');
  addTime(container, '1:55', 27, 19, 'green');

  // Room labels
  addLabel(container, 'Control Room', 12.5, 0.3, 'room-label');
  addLabel(container, 'Analysis Lab', 3.2, 0.3, 'room-label');
  addLabel(container, "Coder's Workshop", 2.5, 10.3, 'room-label');
  addLabel(container, 'Review Bay', 21, 10.3, 'room-label');

  // Agent labels
  addLabel(container, 'orchestrator', 13.3, 6, 'agent-label');
  addLabel(container, 'architect', 2.2, 7.2, 'agent-label');
  addLabel(container, 'planner', 6.2, 7.2, 'agent-label');
  addLabel(container, 'coder', 3.7, 19.5, 'agent-label');
  addLabel(container, 'code-reviewer', 18, 19.3, 'agent-label');
  addLabel(container, 'silent-failure', 22, 19.3, 'agent-label');
  addLabel(container, 'test-reviewer', 26, 19.3, 'agent-label');

  // Artifact objects on desks
  addArtifact(container, 3.5, 4.2, 'blue', 'architecture-assessment.md');
  addArtifact(container, 7.5, 4.2, 'blue', 'implementation-plan.md');
  addArtifact(container, 5, 15.2, 'yellow', 'change-summary.md');
  addArtifact(container, 5.5, 15.6, 'yellow', 'commit: feat(payment)');
  addArtifact(container, 19.5, 15.2, 'red', 'code-review.md');
  addArtifact(container, 23.5, 15.2, 'red clickable', 'silent-failure-review.md', true);
  addArtifact(container, 27.5, 15.2, 'red', 'test-review.md');

  // Click hint for the clickable artifact
  const hint = document.createElement('div');
  hint.className = 'click-hint';
  hint.textContent = 'click to inspect \\u25B6';
  hint.style.left = (22.8 * ST) + 'px';
  hint.style.top = (16 * ST) + 'px';
  container.appendChild(hint);
}

function addBubble(container, html, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'thought-bubble' + (cls ? ' ' + cls : '');
  el.innerHTML = html;
  el.style.left = (x * ST) + 'px';
  el.style.top = (y * ST) + 'px';
  container.appendChild(el);
}

function addTime(container, text, x, y, cls) {
  const el = document.createElement('div');
  el.className = 'time-indicator ' + cls;
  el.textContent = text;
  el.style.left = (x * ST) + 'px';
  el.style.top = (y * ST) + 'px';
  container.appendChild(el);
}

function addLabel(container, text, x, y, cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  el.style.left = (x * ST) + 'px';
  el.style.top = (y * ST) + 'px';
  container.appendChild(el);
}

function addArtifact(container, x, y, cls, title, clickable) {
  const el = document.createElement('div');
  el.className = 'artifact ' + cls;
  el.title = title;
  el.style.left = (x * ST) + 'px';
  el.style.top = (y * ST) + 'px';
  if (clickable) el.addEventListener('click', openArtifactPanel);
  container.appendChild(el);
}

// ============================================================
// ARTIFACT PANEL INTERACTION
// ============================================================
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

// ============================================================
// FALLBACK RENDERING (if tileset loading fails)
// ============================================================
function drawFallback() {
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(0, 0, CW, CH);

  function drawRoom(room, wallColor, floorColor) {
    ctx.fillStyle = floorColor;
    ctx.fillRect(room.x * T, (room.y + 2) * T, room.w * T, (room.h - 2) * T);
    ctx.fillStyle = wallColor;
    ctx.fillRect(room.x * T, room.y * T, room.w * T, 2 * T);
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x * T, room.y * T, room.w * T, room.h * T);
  }

  drawRoom(rooms.control, '#454570', '#c8c8d8');
  drawRoom(rooms.analysis, '#454570', '#c8c8d8');
  drawRoom(rooms.coder, '#504550', '#d0c8c8');
  drawRoom(rooms.review, '#504550', '#d0c8c8');

  // Corridors
  ctx.fillStyle = '#a0a0b0';
  ctx.fillRect(10 * T, 8 * T, 8 * T, 3 * T);
  ctx.fillRect(10 * T, 1 * T, T, 20 * T);
  ctx.fillRect(16 * T, 8 * T, T, 4 * T);

  // Desks
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(2*T, 4*T, 2*T, 2*T);
  ctx.fillRect(6*T, 4*T, 2*T, 2*T);
  ctx.fillRect(3*T, 15*T, 3*T, 2*T);
  ctx.fillRect(18*T, 15*T, 2*T, 2*T);
  ctx.fillRect(22*T, 15*T, 2*T, 2*T);
  ctx.fillRect(26*T, 15*T, 2*T, 2*T);

  // Whiteboard
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(13*T, 1*T, 4*T, 2*T);
  ctx.strokeStyle = '#888';
  ctx.strokeRect(13*T, 1*T, 4*T, 2*T);

  // Characters as simple figures
  const chars = [
    {x:14, y:3.5, c:'#66aaff'}, {x:3, y:5.5, c:'#66cc66'},
    {x:7, y:5.5, c:'#66cc66'}, {x:4, y:16.5, c:'#cccc44'},
    {x:19, y:16.5, c:'#cc6666'}, {x:23, y:16.5, c:'#cc6666'},
    {x:27, y:16.5, c:'#cc6666'},
  ];
  chars.forEach(ch => {
    ctx.fillStyle = ch.c;
    ctx.beginPath();
    ctx.arc((ch.x+0.5)*T, (ch.y+0.5)*T, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc((ch.x+0.5)*T, (ch.y+0.15)*T, 5, 0, Math.PI*2);
    ctx.fill();
  });
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  const canvas = document.getElementById('facility-canvas');
  canvas.width = CW;
  canvas.height = CH;
  canvas.style.width = (CW * SCALE) + 'px';
  canvas.style.height = (CH * SCALE) + 'px';
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  try {
    images = await loadAllAssets();
    drawFacility();
  } catch (err) {
    console.error('Failed to load tileset assets:', err);
    drawFallback();
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
