#!/usr/bin/env node
// Throwaway lane-view server for lifecycle events (spike #988, feeding #985).
//
// Folds the append-only JSONL under FLEET_EVENTS_DIR into lane/session state and
// streams the folded snapshot to one HTML page over SSE. Zero dependencies: only
// node built-ins, so `node serve.mjs` runs with no install step.
//
// Lane identity comes from the path (owner/name/branch/session.jsonl), matching
// what emit-event.mjs writes. The event body is read only for the harness badge
// and the "running {skill}" label.

import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONFIG = {
  eventsDir: process.env.FLEET_EVENTS_DIR ?? join(homedir(), '.codeassembly', 'events'),
  port: Number(process.env.FLEET_PORT ?? 4178),
  staleMs: Number(process.env.FLEET_STALE_MS ?? 90_000),
  rescanMs: Number(process.env.FLEET_RESCAN_MS ?? 5_000),
  tail: Number(process.env.FLEET_TAIL ?? 20),
};

const HTML_PATH = join(dirname(fileURLToPath(import.meta.url)), 'index.html');
const BROADCAST_DEBOUNCE_MS = 100;
const HEARTBEAT_MS = 15_000;

// laneKey ("owner/name/branch") → { repo, branch, sessions: Map<sessionId, session> }
// session: { events: Event[], offset: number, currentSkill: string | null, lastEventTs: string | null }
const lanes = new Map();
const clients = new Set();
let lastSnapshotJson = null;
let watchDebounce = null;

start();

// Bootstrap the fold, HTTP/SSE server, watch trigger, and periodic rescan.
function start() {
  scanAndFold();
  lastSnapshotJson = JSON.stringify(buildSnapshot(Date.now()));

  const server = createServer((req, res) => {
    if (req.url === '/events') {
      handleSse(req, res);
      return;
    }
    if (req.url === '/' || req.url === '/index.html') {
      serveHtml(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(CONFIG.port, () => {
    process.stderr.write(`fleet-view: watching ${CONFIG.eventsDir}\n`);
    process.stderr.write(`fleet-view: http://localhost:${CONFIG.port}\n`);
  });

  try {
    const watcher = watch(CONFIG.eventsDir, { recursive: true }, handleWatchEvent);
    watcher.on('error', (error) => {
      // An async watch error — the tree removed mid-run or an OS watch limit —
      // must not crash the long-running window; the rescan keeps state current.
      process.stderr.write(`fleet-view: watch error (${error.message}); relying on ${CONFIG.rescanMs}ms rescan\n`);
    });
  } catch (error) {
    // fs.watch fails when the tree does not exist yet, or on platforms without
    // recursive support; the periodic rescan is the correctness backstop.
    process.stderr.write(
      `fleet-view: fs.watch unavailable (${error.message}); relying on ${CONFIG.rescanMs}ms rescan\n`,
    );
  }

  setInterval(tick, CONFIG.rescanMs);
  setInterval(sendHeartbeat, HEARTBEAT_MS);
}

// Fold one parsed event into a session, keeping only the last CONFIG.tail events.
// A turn boundary clears the running skill as well as skill.completed does: a turn
// that ends with its skill.completed missing would otherwise leak a stale "running
// {skill}" label into every later turn.
function applyEvent(session, event) {
  session.events.push(event);
  if (session.events.length > CONFIG.tail) {
    session.events = session.events.slice(-CONFIG.tail);
  }
  if (typeof event.ts === 'string') {
    session.lastEventTs = event.ts;
  }
  if (event.type === 'skill.started') {
    session.currentSkill = event.payload?.skill ?? null;
  } else if (event.type === 'skill.completed' || event.type === 'turn.started' || event.type === 'turn.completed') {
    session.currentSkill = null;
  }
}

// Push the current snapshot to all SSE clients, skipping when nothing changed.
// A stale-threshold crossing changes the snapshot with no new event, so the
// JSON diff (not just new bytes) is what gates the push.
function broadcast() {
  const json = JSON.stringify(buildSnapshot(Date.now()));
  if (json === lastSnapshotJson) {
    return;
  }
  lastSnapshotJson = json;
  const frame = `data: ${json}\n\n`;
  for (const res of clients) {
    sendToClient(res, frame);
  }
}

// Map in-memory state into the server→client wire shape, sorted most-recent first.
function buildSnapshot(nowMs) {
  const laneList = [];
  for (const lane of lanes.values()) {
    const sessions = [];
    for (const [sessionId, session] of lane.sessions) {
      const status = deriveStatus(session, nowMs);
      sessions.push({
        session: sessionId,
        harness: resolveHarness(session),
        status: {
          phase: status.phase,
          label: status.label,
          awaitingInput: status.awaitingInput,
          ended: status.ended,
          stale: status.stale,
        },
        lastEventTs: status.lastEventTs,
        tail: session.events,
      });
    }
    sessions.sort((a, b) => toEpochMs(b.lastEventTs) - toEpochMs(a.lastEventTs));
    laneList.push({ repo: lane.repo, branch: lane.branch, sessions });
  }
  laneList.sort((a, b) => getLaneRecencyMs(b) - getLaneRecencyMs(a));
  return { lanes: laneList };
}

// Compute a session's status as a pure function of its events and the clock.
// Stale is an overlay that applies only to active phases (running, wrote artifact);
// waiting, resting, and ended phases are expected to be quiet and never read as stale.
function deriveStatus(session, nowMs) {
  const lastEventTs = session.lastEventTs ?? null;
  const last = session.events[session.events.length - 1];
  if (last === undefined) {
    return { phase: 'idle', label: 'idle', awaitingInput: false, ended: false, stale: false, lastEventTs };
  }
  const { phase, label } = resolvePhase(last, session.currentSkill);
  const awaitingInput = phase === 'awaiting input';
  const ended = phase === 'ended';
  const isActive = phase === 'running' || phase === 'wrote artifact';
  const lastMs = toEpochMs(lastEventTs);
  const stale = isActive && lastMs > 0 && nowMs - lastMs > CONFIG.staleMs;
  return { phase, label, awaitingInput, ended, stale, lastEventTs };
}

// Read the newly appended bytes of one session file and fold complete lines.
// A trailing partial line (write in progress) is left unconsumed for the next tick.
function foldFile({ laneKey, repo, branch, sessionId, filePath }) {
  let size;
  try {
    size = statSync(filePath).size;
  } catch (error) {
    // The file may have vanished between the directory scan and this stat.
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const lane = getLane(laneKey, repo, branch);
  const session = getSession(lane, sessionId);

  // Truncation guard: append-only means this should not happen, but if the file
  // shrank, discard the stale offset and re-fold from the start.
  if (size < session.offset) {
    session.offset = 0;
    session.events = [];
    session.currentSkill = null;
    session.lastEventTs = null;
  }
  if (size === session.offset) {
    return;
  }

  const buffer = Buffer.alloc(size - session.offset);
  const fd = openSync(filePath, 'r');
  let bytesRead;
  try {
    bytesRead = readSync(fd, buffer, 0, buffer.length, session.offset);
  } finally {
    closeSync(fd);
  }

  const chunk = buffer.subarray(0, bytesRead);
  const lastNewline = chunk.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    // No complete line yet; wait for the newline to arrive.
    return;
  }

  const complete = chunk.subarray(0, lastNewline + 1);
  session.offset += complete.length; // byte length, so multi-byte UTF-8 stays aligned
  for (const line of complete.toString('utf8').split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const event = parseLine(line, filePath);
    if (event !== null) {
      applyEvent(session, event);
    }
  }
}

// Get or lazily create the lane bucket for a lane key.
function getLane(laneKey, repo, branch) {
  let lane = lanes.get(laneKey);
  if (lane === undefined) {
    lane = { repo, branch, sessions: new Map() };
    lanes.set(laneKey, lane);
  }
  return lane;
}

// Return a lane's recency as the newest last-event time across its sessions.
function getLaneRecencyMs(lane) {
  let newest = 0;
  for (const session of lane.sessions) {
    newest = Math.max(newest, toEpochMs(session.lastEventTs));
  }
  return newest;
}

// Get or lazily create the session bucket within a lane.
function getSession(lane, sessionId) {
  let session = lane.sessions.get(sessionId);
  if (session === undefined) {
    session = { events: [], offset: 0, currentSkill: null, lastEventTs: null };
    lane.sessions.set(sessionId, session);
  }
  return session;
}

// Serve the SSE stream: send the current snapshot immediately, then live frames.
function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  // Drop a client whose socket errors so a later broadcast write can't crash the process.
  res.on('error', () => clients.delete(res));
  clients.add(res);
  req.on('close', () => {
    clients.delete(res);
  });
  sendToClient(res, `data: ${JSON.stringify(buildSnapshot(Date.now()))}\n\n`);
}

// Handle a raw fs.watch event, debounced so a burst folds and broadcasts once.
function handleWatchEvent() {
  if (watchDebounce !== null) {
    return;
  }
  watchDebounce = setTimeout(() => {
    watchDebounce = null;
    tick();
  }, BROADCAST_DEBOUNCE_MS);
}

// Parse one JSONL line, skipping (not crashing on) malformed input.
function parseLine(line, filePath) {
  try {
    return JSON.parse(line);
  } catch (error) {
    process.stderr.write(`fleet-view: skipping malformed line in ${filePath}: ${error.message}\n`);
    return null;
  }
}

// Resolve the harness badge from the most recent event that carries one.
function resolveHarness(session) {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const harness = session.events[index].harness;
    if (harness !== undefined) {
      return harness;
    }
  }
  return null;
}

// Map the last event to a phase key and a display label.
//
// Ended and waiting-on-user are both derived here rather than tracked: a session whose
// latest event is session.ended has ended, and one whose latest event is turn.completed
// has handed the conversation back to the user. Deriving keeps resume working for free —
// Rovo ends a session on a switch, and switching back appends a session.started that
// becomes the new latest event.
function resolvePhase(event, currentSkill) {
  switch (event.type) {
    case 'session.started':
      // Open, but nothing asked of it yet. Not awaiting input: no turn has completed, so
      // there is no answer for the user to read.
      return { phase: 'idle', label: 'session started' };
    case 'session.ended':
      return { phase: 'ended', label: 'ended' };
    case 'turn.started':
      return { phase: 'running', label: 'running' };
    case 'turn.completed':
      return { phase: 'awaiting input', label: 'awaiting input' };
    case 'input.requested':
      return { phase: 'awaiting input', label: 'awaiting input' };
    case 'skill.started':
    case 'skill.progress': {
      const skill = currentSkill ?? event.payload?.skill;
      return { phase: 'running', label: skill ? `running ${skill}` : 'running' };
    }
    case 'artifact.written':
      return { phase: 'wrote artifact', label: 'wrote artifact' };
    case 'skill.completed':
      return { phase: 'idle', label: 'idle' };
    case 'pr.created':
      return { phase: 'PR created', label: 'PR created' };
    default:
      return { phase: event.type, label: event.type };
  }
}

// Walk the events tree and fold every session file's newly appended bytes.
// One idempotent routine shared by startup, the watch trigger, and the rescan
// timer: offsets make repeated calls never double-count, and new files/lanes
// are discovered on each pass.
function scanAndFold() {
  let entries;
  try {
    entries = readdirSync(CONFIG.eventsDir, { recursive: true });
  } catch (error) {
    // The tree may not exist yet; the rescan will pick it up once created.
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const relative of entries) {
    if (!relative.endsWith('.jsonl')) {
      continue;
    }
    const segments = relative.split(sep);
    if (segments.length !== 4) {
      // Not an owner/name/branch/session.jsonl leaf; skip defensively.
      continue;
    }
    const [owner, name, branch, sessionFile] = segments;
    foldFile({
      laneKey: `${owner}/${name}/${branch}`,
      repo: `${owner}/${name}`,
      branch,
      sessionId: sessionFile.slice(0, -'.jsonl'.length),
      filePath: join(CONFIG.eventsDir, relative),
    });
  }
}

// Send an SSE comment heartbeat so idle connections survive proxies and browsers.
function sendHeartbeat() {
  for (const res of clients) {
    sendToClient(res, ':\n\n');
  }
}

// Write one SSE frame to a client, dropping it if the socket is already gone, so
// one dead connection can neither break the broadcast loop nor crash the process.
function sendToClient(res, frame) {
  try {
    res.write(frame);
  } catch {
    clients.delete(res);
  }
}

// Serve the self-contained client page.
function serveHtml(res) {
  let html;
  try {
    html = readFileSync(HTML_PATH);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`could not read index.html: ${error.message}`);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Fold once, then broadcast; both triggers funnel through here.
function tick() {
  try {
    scanAndFold();
  } catch (error) {
    process.stderr.write(`fleet-view: scan error: ${error.stack ?? error}\n`);
    return;
  }
  broadcast();
}

// Parse an ISO timestamp to epoch ms, returning 0 when absent or unparseable.
function toEpochMs(ts) {
  if (typeof ts !== 'string') {
    return 0;
  }
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}
