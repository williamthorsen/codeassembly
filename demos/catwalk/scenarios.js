// § CONSTANTS

// Canvas dimensions
var LAYOUT_MARGIN = 100;
var STATION_GAP = 30; // clear gap between visual content of adjacent stations
export let PLATFORM_W;
export const CANVAS_H = 540;

// Vertical positions
export const CATWALK_Y = 100;
export const GROUND_Y = 340;
export const CHUTE_TOP = CATWALK_Y + 48;
export const CHUTE_BOT = GROUND_Y - 20;

// Horizontal layout — computed after PHASES so gaps between outermost agents are uniform
export let STATION_X; // assigned by computeDefaultPositions()

// Agent sizing
export const AGENT_RADIUS = 14;
export const ORCH_RADIUS = 16;

// Artifact sizing
export const ART_W = 40;
export const ART_H = 16;

// Gate sizing (golden bars on the catwalk)
export const GATE_W = 6;

// Timing (ms)
export const WALK_SPEED = 400; // px/sec
export const CHUTE_DURATION = 600;
export const WORK_DURATION = 1200;
export const PAUSE_DURATION = 300;

// Station colors (CGA-16)
export const STATION_COLORS = [
  '#5555FF', // 0: architecture — blue
  '#55FF55', // 1: planning — green
  '#FFFF55', // 2: implementation — yellow/amber
  '#FF5555', // 3: review — red
  '#FF55FF', // 4: simplifier — magenta
  '#55FFFF', // 5: holistic — cyan
  '#FFFFFF', // 6: outputs — white
];

// Artifact colors
export const ARTIFACT_COLORS = {
  reqs: '#dee2e6',
  xplan: '#d0ebff',
  arch: '#a5d8ff',
  plan: '#b2f2bb',
  code: '#fff3bf',
  review: '#ffc9c9',
  fixes: '#ffe8cc',
  clean: '#f3d9fa',
  holi: '#c3fae8',
  summary: '#f8f9fa',
};

// Orchestrator color
export const ORCH_COLOR = '#FFD700';

// Verdict icon config — maps reviewer criticality to glyph + color.
// Modify this object to change what icons appear above reviewer agents.
export const VERDICT_DISPLAY = {
  none: { glyph: '✓', color: '#55FF55' },
  low: { glyph: '!', color: '#FFFF55' },
  medium: { glyph: '!!', color: '#FFAA00' },
  high: { glyph: '✗', color: '#FF5555' },
};

// Returns { glyph, color } for a criticality level, or null if unknown.
export function verdictIcon(criticality) {
  return VERDICT_DISPLAY[criticality] || null;
}

// Phase definitions
export const PHASES = [
  { name: 'Architecture', agents: ['arch'], color: STATION_COLORS[0] },
  { name: 'Planning', agents: ['plan'], color: STATION_COLORS[1] },
  { name: 'Implementation', agents: ['coder'], color: STATION_COLORS[2] },
  { name: 'Review', agents: ['core', 'code', 'silnt', 'test'], color: STATION_COLORS[3] },
  { name: 'Simplifier', agents: ['simp'], color: STATION_COLORS[4] },
  { name: 'Holistic', agents: ['holi'], color: STATION_COLORS[5] },
  { name: 'Outputs', agents: [], color: STATION_COLORS[6] },
];

// Place stations using asymmetric extents that account for artifact overhang.
// Input artifacts extend left of the leftmost agent; output records extend right.
// STATION_GAP is the clear space between the visual content of adjacent stations.
// Returns { positions, platformW }.
function layoutStations(phaseIndices) {
  var agentSpacing = AGENT_RADIUS * 2 + 20;
  var inputOverhang = ART_W * 1.5 + 11; // left extent beyond leftmost agent/center
  var outputOverhang = ART_W / 2; // right extent beyond rightmost agent/center

  var leftExtents = [];
  var rightExtents = [];
  for (const phaseIndex of phaseIndices) {
    var agentCount = Math.max(PHASES[phaseIndex].agents.length, 1);
    var agentHW = ((agentCount - 1) * agentSpacing) / 2;
    leftExtents.push(agentHW + inputOverhang);
    rightExtents.push(agentHW + outputOverhang);
  }

  var positions = [LAYOUT_MARGIN + leftExtents[0]];
  for (var i = 1; i < phaseIndices.length; i++) {
    positions.push(Math.round(positions[i - 1] + rightExtents[i - 1] + STATION_GAP + leftExtents[i]));
  }
  var platformW = positions.at(-1) + rightExtents.at(-1) + LAYOUT_MARGIN;
  return { positions: positions, platformW: platformW };
}

// Compute default positions for all stations.
export function computeDefaultPositions() {
  var indices = [];
  for (var i = 0; i < PHASES.length; i++) indices.push(i);
  var result = layoutStations(indices);
  PLATFORM_W = result.platformW;
  return result.positions;
}

// Compute compact positions for visible stations only.
// Returns { positions, platformW } or null if nothing to compact.
export function computeCompactPositions(scenario) {
  var absent = new Set();
  for (var s = 0; s < scenario.steps.length; s++) {
    if (scenario.steps[s].type === 'absent') absent.add(scenario.steps[s].station);
  }
  var visible = [];
  for (var i = 0; i < PHASES.length; i++) {
    if (!absent.has(i)) visible.push(i);
  }
  if (visible.length === PHASES.length) return null;

  var result = layoutStations(visible);
  var positions = Array.from({ length: PHASES.length }).fill(-200);
  for (const [j, element] of visible.entries()) {
    positions[element] = result.positions[j];
  }
  return { positions: positions, platformW: result.platformW };
}

STATION_X = computeDefaultPositions();

// § PHASE AGENT OVERRIDES

var DEFAULT_PHASE_AGENTS = PHASES.map(function (p) {
  return p.agents.slice();
});

// Override the agent list for a single station. Recomputes positions.
export function setPhaseAgents(stationIndex, agents) {
  PHASES[stationIndex].agents = agents;
  STATION_X = computeDefaultPositions();
  DEFAULT_STATION_X = STATION_X.slice();
  DEFAULT_PLATFORM_W = PLATFORM_W;
}

// Restore all phases to their original agent lists. Recomputes positions.
export function resetPhaseAgents() {
  for (const [i, PHASE] of PHASES.entries()) {
    PHASE.agents = DEFAULT_PHASE_AGENTS[i].slice();
  }
  STATION_X = computeDefaultPositions();
  DEFAULT_STATION_X = STATION_X.slice();
  DEFAULT_PLATFORM_W = PLATFORM_W;
}

// § LAYOUT

var DEFAULT_STATION_X = STATION_X.slice();
var DEFAULT_PLATFORM_W = PLATFORM_W;

export function stationX(index) {
  return STATION_X[index];
}

// Override station positions (for compact mode).
// Pass null to restore defaults.
export function setStationPositions(positions, platformW) {
  if (positions) {
    STATION_X = positions;
    PLATFORM_W = platformW;
  } else {
    STATION_X = DEFAULT_STATION_X.slice();
    PLATFORM_W = DEFAULT_PLATFORM_W;
  }
}

// First/last station with a valid (on-screen) position.
// In compact mode absent stations are at -200; this skips them.
export function visibleStationRange() {
  var first = STATION_X[0],
    last = STATION_X.at(-1);
  for (const x of STATION_X) {
    if (x >= 0) {
      first = x;
      break;
    }
  }
  for (let i = STATION_X.length - 1; i >= 0; i--) {
    if (STATION_X[i] >= 0) {
      last = STATION_X[i];
      break;
    }
  }
  return { first: first, last: last };
}

export function agentX(stationIndex, agentIndex, agentCount) {
  const cx = stationX(stationIndex);
  const spacing = AGENT_RADIUS * 2 + 20;
  const totalWidth = (agentCount - 1) * spacing;
  return cx - totalWidth / 2 + agentIndex * spacing;
}

// § STEP WEIGHTS — relative time consumed by each step type

const STEP_WEIGHTS = {
  inputs: 0.5,
  skip: 0.5,
  absent: 0.2,
  threeBeat: 2,
  twoBeat: 1.5,
  reviewCycle: 6,
  fixShuttle: 2,
  outputs: 2,
};

export function computeStepWeight(step) {
  if (step.type === 'reviewCycle') {
    return STEP_WEIGHTS.reviewCycle + (step.rounds.length - 1) * 2;
  }
  return STEP_WEIGHTS[step.type] || 1;
}

export function computeTotalWeight(steps) {
  return steps.reduce(function (sum, step) {
    return sum + computeStepWeight(step);
  }, 0);
}

// § SCENARIOS

export const SCENARIOS = {
  vibe: {
    label: 'vibe',
    targetDuration: 8 * 60,
    steps: [
      { type: 'inputs' },
      { type: 'absent', station: 0 },
      { type: 'absent', station: 1 },
      {
        type: 'threeBeat',
        station: 2,
        agent: 'coder',
        dispatch: { label: 'reqs', color: ARTIFACT_COLORS.reqs },
        produce: { label: 'code', color: ARTIFACT_COLORS.code },
        orchUpdate: { setSlot: 'code' },
      },
      {
        type: 'reviewCycle',
        station: 3,
        rounds: [{ reviewers: [0, 1, 2, 3], fix: false, verdicts: ['low', 'none', 'low', 'none'] }],
      },
      {
        type: 'twoBeat',
        station: 4,
        agent: 'simp',
        produce: { label: 'clean', color: ARTIFACT_COLORS.clean },
        verdict: 'low',
        verdictDismissed: true,
      },
      {
        type: 'twoBeat',
        station: 5,
        agent: 'holi',
        produce: { label: 'holi', color: ARTIFACT_COLORS.holi },
        verdict: 'none',
      },
      { type: 'outputs', station: 6 },
    ],
  },

  lite: {
    label: 'lite',
    targetDuration: 15 * 60,
    steps: [
      { type: 'inputs' },
      { type: 'absent', station: 0 },
      { type: 'absent', station: 1 },
      {
        type: 'threeBeat',
        station: 2,
        agent: 'coder',
        dispatch: { label: 'reqs', color: ARTIFACT_COLORS.reqs },
        produce: { label: 'code', color: ARTIFACT_COLORS.code },
        orchUpdate: { setSlot: 'code' },
      },
      {
        type: 'reviewCycle',
        station: 3,
        rounds: [
          { reviewers: [0, 1, 2, 3], fix: true, verdicts: ['medium', 'low', 'none', 'none'] },
          { reviewers: [0, 1], fix: false, verdicts: ['none', 'none'] },
        ],
      },
      {
        type: 'twoBeat',
        station: 4,
        agent: 'simp',
        produce: { label: 'clean', color: ARTIFACT_COLORS.clean },
        verdict: 'low',
      },
      { type: 'fixShuttle', targetStation: 2, resolveAgent: 'simp' },
      {
        type: 'twoBeat',
        station: 5,
        agent: 'holi',
        produce: { label: 'holi', color: ARTIFACT_COLORS.holi },
        verdict: 'none',
      },
      { type: 'outputs', station: 6 },
    ],
  },

  default: {
    label: 'default',
    targetDuration: 22 * 60,
    steps: [
      { type: 'inputs' },
      { type: 'skip', station: 0 },
      {
        type: 'threeBeat',
        station: 1,
        agent: 'plan',
        dispatch: { label: 'reqs', color: ARTIFACT_COLORS.reqs },
        produce: { label: 'plan', color: ARTIFACT_COLORS.plan },
        orchUpdate: { addTransient: { label: 'plan', color: ARTIFACT_COLORS.plan } },
      },
      {
        type: 'threeBeat',
        station: 2,
        agent: 'coder',
        dispatch: { label: 'plan', color: ARTIFACT_COLORS.plan },
        produce: { label: 'code', color: ARTIFACT_COLORS.code },
        orchUpdate: { setSlot: 'code' },
      },
      {
        type: 'reviewCycle',
        station: 3,
        rounds: [
          { reviewers: [0, 1, 2, 3], fix: true, verdicts: ['medium', 'low', 'none', 'low'] },
          { reviewers: [0, 1], fix: false, verdicts: ['none', 'none'] },
        ],
      },
      {
        type: 'twoBeat',
        station: 4,
        agent: 'simp',
        produce: { label: 'clean', color: ARTIFACT_COLORS.clean },
        verdict: 'low',
      },
      { type: 'fixShuttle', targetStation: 2, resolveAgent: 'simp' },
      {
        type: 'twoBeat',
        station: 5,
        agent: 'holi',
        produce: { label: 'holi', color: ARTIFACT_COLORS.holi },
        verdict: 'low',
      },
      { type: 'fixShuttle', targetStation: 2, resolveAgent: 'holi' },
      { type: 'outputs', station: 6 },
    ],
  },

  strict: {
    label: 'strict',
    targetDuration: 30 * 60,
    steps: [
      { type: 'inputs' },
      {
        type: 'threeBeat',
        station: 0,
        agent: 'arch',
        dispatch: { label: 'reqs', color: ARTIFACT_COLORS.reqs },
        produce: { label: 'arch', color: ARTIFACT_COLORS.arch },
        orchUpdate: { addTransient: { label: 'arch', color: ARTIFACT_COLORS.arch } },
      },
      {
        type: 'threeBeat',
        station: 1,
        agent: 'plan',
        dispatch: { label: 'arch', color: ARTIFACT_COLORS.arch },
        produce: { label: 'plan', color: ARTIFACT_COLORS.plan },
        orchUpdate: { consumeTransient: 'arch', addTransient: { label: 'plan', color: ARTIFACT_COLORS.plan } },
      },
      {
        type: 'threeBeat',
        station: 2,
        agent: 'coder',
        dispatch: { label: 'plan', color: ARTIFACT_COLORS.plan },
        produce: { label: 'code', color: ARTIFACT_COLORS.code },
        orchUpdate: { setSlot: 'code' },
      },
      {
        type: 'reviewCycle',
        station: 3,
        rounds: [
          { reviewers: [0, 1, 2, 3], fix: true, verdicts: ['high', 'medium', 'low', 'none'] },
          { reviewers: [0, 1, 2], fix: true, verdicts: ['low', 'none', 'none'] },
          { reviewers: [0], fix: false, verdicts: ['none'] },
        ],
      },
      {
        type: 'twoBeat',
        station: 4,
        agent: 'simp',
        produce: { label: 'clean', color: ARTIFACT_COLORS.clean },
        verdict: 'medium',
      },
      { type: 'fixShuttle', targetStation: 2, resolveAgent: 'simp' },
      {
        type: 'twoBeat',
        station: 5,
        agent: 'holi',
        produce: { label: 'holi', color: ARTIFACT_COLORS.holi },
        verdict: 'low',
      },
      { type: 'fixShuttle', targetStation: 2, resolveAgent: 'holi' },
      { type: 'outputs', station: 6 },
    ],
  },

  simple: {
    label: 'simple',
    targetDuration: 5 * 60,
    steps: [
      { type: 'inputs' },
      { type: 'absent', station: 0 },
      { type: 'absent', station: 1 },
      {
        type: 'threeBeat',
        station: 2,
        agent: 'coder',
        dispatch: { label: 'reqs', color: ARTIFACT_COLORS.reqs },
        produce: { label: 'code', color: ARTIFACT_COLORS.code },
        orchUpdate: { setSlot: 'code' },
      },
      {
        type: 'reviewCycle',
        station: 3,
        agents: ['rev'],
        rounds: [
          { reviewers: [0], fix: true, verdicts: ['high'] },
          { reviewers: [0], fix: true, verdicts: ['medium'] },
          { reviewers: [0], fix: true, verdicts: ['none'] },
        ],
      },
      { type: 'absent', station: 4 },
      { type: 'absent', station: 5 },
      { type: 'outputs', station: 6 },
    ],
  },
};
