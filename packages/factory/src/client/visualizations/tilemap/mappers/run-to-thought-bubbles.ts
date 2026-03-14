import type { PhaseName } from '../../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE } from '../../../../shared/constants/role-types.js';
import {
  findCurrentPhase,
  findPhaseDecision,
  isPhaseEvaluated,
  isPhasePresentInData,
} from '../../../../shared/phase-inference.js';
import type {
  CanonicalRunStatus,
  Criticality,
  ParallelReviewPhase,
  Phases,
} from '../../../../shared/types/canonical.js';
import type { ThoughtBubbleConfig, ThoughtBubbleSeverity, ThoughtBubbleText } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Short phase alias used as agent IDs for non-review phases. */
const PHASE_AGENT_ID: Partial<Record<PhaseName, string>> = {
  architecture: 'arch',
  planning: 'plan',
  implementation: 'coder',
  simplifier: 'simp',
  holistic: 'holi',
};

/** Stagger interval in milliseconds between agents. */
const STAGGER_INTERVAL_MS = 800;

// ---------------------------------------------------------------------------
// Type guards and helpers
// ---------------------------------------------------------------------------

/**
 * Check that a value is neither null nor undefined. The Phases type uses
 * `| undefined` but runtime data from Zod can carry `null` phase values.
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/** Narrow an unknown value to a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

/** Map a Criticality value to the visual severity for bubble borders. */
function mapCriticalityToSeverity(criticality: Criticality | undefined): ThoughtBubbleSeverity {
  switch (criticality) {
    case 'high':
      return 'critical';
    case 'medium':
      return 'warning';
    case 'low':
    case 'none':
    case undefined:
      return 'normal';
  }
}

// ---------------------------------------------------------------------------
// Phase status accessors — derive human-readable status text
// ---------------------------------------------------------------------------

/** Derive the phase status text for architecture. */
function describeArchitecturePhase(phases: Phases): string | undefined {
  const arch = phases.architecture;
  if (!isPresent(arch)) return undefined;

  if (arch.status === 'in_progress') return 'Analyzing architectural impact...';

  const impactLabel = isPresent(arch.impactLevel) ? arch.impactLevel : 'assessed';
  return `Impact: ${impactLabel}`;
}

/** Derive the phase status text for planning. */
function describePlanningPhase(phases: Phases): string | undefined {
  const plan = phases.planning;
  if (!isPresent(plan)) return undefined;

  if (plan.status === 'in_progress') return 'Building implementation plan...';

  const stepLabel = isPresent(plan.stepCount) ? `${String(plan.stepCount)} steps` : 'complete';
  return `Plan: ${stepLabel}`;
}

/** Derive the phase status text for implementation. */
function describeImplementationPhase(phases: Phases): string | undefined {
  const impl = phases.implementation;
  if (!isPresent(impl)) return undefined;

  if (impl.status === 'in_progress') return 'Implementing changes...';
  return 'Implementation complete';
}

/** Derive the phase status text for the code simplifier. */
function describeSimplifierPhase(phases: Phases): string | undefined {
  const simp = phases.codeSimplifier;
  if (!isPresent(simp)) return undefined;

  if (simp.status === 'in_progress') return 'Simplifying code...';
  if (!simp.ran) return undefined;

  return simp.actionableFindings ? 'Found simplification opportunities' : 'Code is clean';
}

/** Derive the phase status text for holistic review. */
function describeHolisticPhase(phases: Phases): string | undefined {
  const holi = phases.holisticReview;
  if (!isPresent(holi)) return undefined;

  if (holi.status === 'in_progress') return 'Reviewing holistic quality...';
  return isPresent(holi.criticality) ? `Holistic: ${holi.criticality} criticality` : 'Holistic review complete';
}

/** Get a human-readable description for a phase's current state. */
function describePhaseStatus(phase: PhaseName, phases: Phases): string | undefined {
  switch (phase) {
    case 'architecture':
      return describeArchitecturePhase(phases);
    case 'planning':
      return describePlanningPhase(phases);
    case 'implementation':
      return describeImplementationPhase(phases);
    case 'simplifier':
      return describeSimplifierPhase(phases);
    case 'holistic':
      return describeHolisticPhase(phases);
    case 'review':
    case 'summary':
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Progress text from artifacts
// ---------------------------------------------------------------------------

/**
 * Derive progress text from change-summary artifacts.
 * Counts the number of code-type and change-summary artifacts to produce
 * a quantitative summary.
 */
function deriveProgressText(phase: PhaseName, status: CanonicalRunStatus): string | undefined {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) return undefined;

  // Map phases to their data-model property names for artifact matching
  const phaseArtifactKeys: Partial<Record<PhaseName, string[]>> = {
    architecture: ['architecture'],
    planning: ['planning'],
    implementation: ['implementation'],
    review: ['parallelReview', 'review'],
    simplifier: ['codeSimplifier'],
    holistic: ['holisticReview'],
  };

  const keys = phaseArtifactKeys[phase];
  if (keys === undefined) return undefined;

  const phaseArtifacts = status.artifacts.filter((a) => keys.includes(a.phase));
  if (phaseArtifacts.length === 0) return undefined;

  const changeSummaries = phaseArtifacts.filter((a) => a.type === 'change-summary');
  if (changeSummaries.length > 0) {
    return `${String(changeSummaries.length)} change ${changeSummaries.length === 1 ? 'summary' : 'summaries'} produced`;
  }

  return `${String(phaseArtifacts.length)} ${phaseArtifacts.length === 1 ? 'artifact' : 'artifacts'} produced`;
}

// ---------------------------------------------------------------------------
// Review-specific text derivation
// ---------------------------------------------------------------------------

/** Extract reviewer names from parallel review data. */
function extractReviewerNames(parallelReview: ParallelReviewPhase): string[] {
  // Shape 1: flat reviewers record
  const reviewers = parallelReview.reviewers;
  if (isPresent(reviewers) && Object.keys(reviewers).length > 0) {
    return Object.keys(reviewers);
  }

  // Shape 2: iterations[].perReviewer (untyped, passes through Zod .loose())
  const iterations = parallelReview.iterations;
  if (isPresent(iterations) && iterations.length > 0) {
    const names = new Set<string>();
    for (const iteration of iterations) {
      if ('perReviewer' in iteration) {
        const perReviewer: unknown = iteration.perReviewer;
        if (isRecord(perReviewer)) {
          for (const name of Object.keys(perReviewer)) {
            names.add(name);
          }
        }
      }
      if (Array.isArray(iteration.reviewers)) {
        for (const name of iteration.reviewers) {
          names.add(name);
        }
      }
    }
    if (names.size > 0) return Array.from(names);
  }

  // Shape 3: top-level reviewerDetails (untyped, passes through Zod .loose())
  if ('reviewerDetails' in parallelReview) {
    const reviewerDetails: unknown = parallelReview.reviewerDetails;
    if (isRecord(reviewerDetails)) {
      const keys = Object.keys(reviewerDetails);
      if (keys.length > 0) return keys;
    }
  }

  return [];
}

/** Derive finding text for a specific reviewer. */
function deriveReviewerFindingText(
  reviewerName: string,
  parallelReview: ParallelReviewPhase,
): ThoughtBubbleText | undefined {
  const reviewers = parallelReview.reviewers;
  if (!isPresent(reviewers)) return undefined;

  const info = reviewers[reviewerName];
  if (!isPresent(info)) return undefined;

  if (isPresent(info.criticality) && info.criticality !== 'none') {
    let label: string;
    if (info.criticality === 'high') {
      label = 'F';
    } else if (info.criticality === 'medium') {
      label = 'W';
    } else {
      label = 'T';
    }
    const reasonSnippet = isPresent(info.reason) ? `: ${info.reason}` : '';
    return {
      content: `Found ${label}${reasonSnippet}`,
      category: 'finding',
    };
  }

  return undefined;
}

/** Get the highest criticality from a reviewer's data, considering re-reviews. */
function getReviewerCriticality(reviewerName: string, parallelReview: ParallelReviewPhase): Criticality | undefined {
  const reviewers = parallelReview.reviewers;
  if (!isPresent(reviewers)) return undefined;

  const info = reviewers[reviewerName];
  if (!isPresent(info)) return undefined;

  // Re-review criticality takes precedence when present
  return info.reReviewCriticality ?? info.criticality;
}

// ---------------------------------------------------------------------------
// Agent text builders
// ---------------------------------------------------------------------------

/** Determine the animation-like state of an agent for text derivation. */
type AgentTextState = 'working' | 'completed' | 'idle' | 'failed' | 'waiting';

function resolveAgentTextState(
  phase: PhaseName,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentTextState {
  if (status.status === 'completed') return 'completed';
  if (status.status === 'failed') return 'failed';

  // Check if this agent is waiting for input
  if (phase === currentPhase && isPresent(status.waitingForInput)) return 'waiting';

  // Working: either inferred as current phase (no data yet) or explicitly in_progress
  if (phase === currentPhase && !isPhasePresentInData(phase, status.phases)) return 'working';
  if (isPhaseInProgress(phase, status.phases)) return 'working';

  // Completed: phase has been evaluated
  if (isPhaseEvaluated(phase, status.phases)) return 'completed';

  return 'idle';
}

/** Check whether a phase is explicitly in progress. */
function isPhaseInProgress(phase: PhaseName, phases: Phases): boolean {
  switch (phase) {
    case 'architecture':
      return phases.architecture?.status === 'in_progress';
    case 'planning':
      return phases.planning?.status === 'in_progress';
    case 'implementation':
      return phases.implementation?.status === 'in_progress';
    case 'review':
      if (isPresent(phases.parallelReview)) return phases.parallelReview.status === 'in_progress';
      if (isPresent(phases.review)) return phases.review.status === 'in_progress';
      return false;
    case 'simplifier':
      return phases.codeSimplifier?.status === 'in_progress';
    case 'holistic':
      return phases.holisticReview?.status === 'in_progress';
    case 'summary':
      return false;
  }
}

/** Build texts for a non-review agent based on its current state. */
function buildAgentTexts(
  phase: PhaseName,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): ThoughtBubbleText[] {
  const agentState = resolveAgentTextState(phase, status, currentPhase);
  const texts: ThoughtBubbleText[] = [];

  switch (agentState) {
    case 'idle':
      texts.push({ content: 'Standing by...', category: 'idle' });
      break;

    case 'waiting':
      texts.push({ content: 'Waiting for input...', category: 'waiting' });
      break;

    case 'failed':
      texts.push({ content: 'Something went wrong...', category: 'task' });
      break;

    case 'working': {
      // Working task text — phase-specific status description
      const phaseLabel = PHASE_ROLE[phase];
      const taskText = describePhaseStatus(phase, status.phases);
      if (isPresent(taskText)) {
        texts.push({ content: taskText, category: 'task' });
      } else {
        texts.push({ content: `${capitalize(phaseLabel)} is working...`, category: 'task' });
      }
      break;
    }

    case 'completed': {
      // Completed — show task summary and optionally progress
      const completedText = describePhaseStatus(phase, status.phases);
      if (isPresent(completedText)) {
        texts.push({ content: completedText, category: 'task' });
      } else {
        texts.push({ content: 'Done', category: 'task' });
      }

      const progressText = deriveProgressText(phase, status);
      if (isPresent(progressText)) {
        texts.push({ content: progressText, category: 'progress' });
      }
      break;
    }
  }

  return texts;
}

/** Derive waiting text based on which phase this agent is waiting for. */
function deriveWaitingText(phase: PhaseName, currentPhase: PhaseName | undefined): string {
  if (!isPresent(currentPhase)) return 'Waiting...';

  const currentPhaseRole = PHASE_ROLE[currentPhase];
  const phaseIndex = PHASE_NAMES.indexOf(phase);
  const currentIndex = PHASE_NAMES.indexOf(currentPhase);

  if (phaseIndex > currentIndex) {
    return `Waiting for ${currentPhaseRole} to finish`;
  }

  return 'Waiting...';
}

/** Build texts for a reviewer agent. */
function buildReviewerTexts(
  reviewerName: string,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): ThoughtBubbleText[] {
  const texts: ThoughtBubbleText[] = [];
  const agentState = resolveAgentTextState('review', status, currentPhase);

  switch (agentState) {
    case 'idle': {
      const waitingText = deriveWaitingText('review', currentPhase);
      texts.push({ content: waitingText, category: 'idle' });
      break;
    }

    case 'waiting':
      texts.push({ content: 'Waiting for input...', category: 'waiting' });
      break;

    case 'failed':
      texts.push({ content: 'Something went wrong...', category: 'task' });
      break;

    case 'working':
      texts.push({ content: `Reviewing code...`, category: 'task' });
      break;

    case 'completed': {
      texts.push({ content: 'Review complete', category: 'task' });

      // Add finding text if available
      const parallelReview = status.phases.parallelReview;
      if (isPresent(parallelReview)) {
        const findingText = deriveReviewerFindingText(reviewerName, parallelReview);
        if (isPresent(findingText)) {
          texts.push(findingText);
        }
      }
      break;
    }
  }

  return texts;
}

// ---------------------------------------------------------------------------
// Severity resolution
// ---------------------------------------------------------------------------

/** Resolve severity for a non-review agent based on phase data. */
function resolveAgentSeverity(phase: PhaseName, phases: Phases): ThoughtBubbleSeverity {
  switch (phase) {
    case 'simplifier': {
      const simp = phases.codeSimplifier;
      if (isPresent(simp) && simp.actionableFindings) return 'warning';
      return 'normal';
    }
    case 'holistic':
      return mapCriticalityToSeverity(phases.holisticReview?.criticality);
    default:
      return 'normal';
  }
}

/** Resolve severity for a reviewer based on their findings. */
function resolveReviewerSeverity(reviewerName: string, phases: Phases): ThoughtBubbleSeverity {
  const parallelReview = phases.parallelReview;
  if (!isPresent(parallelReview)) return 'normal';

  const criticality = getReviewerCriticality(reviewerName, parallelReview);
  return mapCriticalityToSeverity(criticality);
}

// ---------------------------------------------------------------------------
// Stagger offset calculation
// ---------------------------------------------------------------------------

/**
 * Calculate stagger offsets distributed across all agents.
 * Offsets are evenly spaced by STAGGER_INTERVAL_MS so bubbles do not
 * all cycle at the same moment.
 */
function calculateStaggerOffset(index: number): number {
  return index * STAGGER_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (str.length === 0) return str;
  const first = str[0];
  if (first === undefined) return str;
  return first.toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

/**
 * Map a `CanonicalRunStatus` to an array of `ThoughtBubbleConfig` objects,
 * one per agent in the run. Each config contains cycling text content,
 * severity, and a stagger offset for distributed animation timing.
 */
export function mapRunToThoughtBubbles(status: CanonicalRunStatus): ThoughtBubbleConfig[] {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const bubbles: ThoughtBubbleConfig[] = [];
  let agentIndex = 0;

  for (const phase of PHASE_NAMES) {
    // Skip summary — the orchestrator has no thought bubble
    if (phase === 'summary') continue;

    // Skip phases decided to not run
    const decision = findPhaseDecision(phase, status.phaseDecisions);
    if (decision?.run === false) continue;

    if (phase === 'review') {
      const reviewerBubbles = buildReviewerBubbles(status, currentPhase, agentIndex);
      bubbles.push(...reviewerBubbles);
      agentIndex += reviewerBubbles.length;
      continue;
    }

    const agentId = PHASE_AGENT_ID[phase];
    if (agentId === undefined) continue;

    const texts = buildAgentTexts(phase, status, currentPhase);
    const severity = resolveAgentSeverity(phase, status.phases);

    bubbles.push({
      agentId,
      agentRole: PHASE_ROLE[phase],
      roleType: PHASE_ROLE_TYPE[phase],
      phase,
      texts,
      severity,
      staggerOffsetMs: calculateStaggerOffset(agentIndex),
    });

    agentIndex++;
  }

  return bubbles;
}

/** Build thought bubble configs for all reviewer agents. */
function buildReviewerBubbles(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
  startIndex: number,
): ThoughtBubbleConfig[] {
  const parallelReview = status.phases.parallelReview;

  if (!isPresent(parallelReview)) {
    // Default single reviewer when no parallel review data exists
    const texts = buildReviewerTexts('reviewer', status, currentPhase);
    return [
      {
        agentId: 'reviewer-0',
        agentRole: 'reviewer',
        roleType: PHASE_ROLE_TYPE.review,
        phase: 'review',
        texts,
        severity: 'normal',
        staggerOffsetMs: calculateStaggerOffset(startIndex),
      },
    ];
  }

  const names = extractReviewerNames(parallelReview);
  if (names.length === 0) {
    const texts = buildReviewerTexts('reviewer', status, currentPhase);
    return [
      {
        agentId: 'reviewer-0',
        agentRole: 'reviewer',
        roleType: PHASE_ROLE_TYPE.review,
        phase: 'review',
        texts,
        severity: 'normal',
        staggerOffsetMs: calculateStaggerOffset(startIndex),
      },
    ];
  }

  const reviewPhase: PhaseName = 'review';

  return names.map((name, i) => {
    const texts = buildReviewerTexts(name, status, currentPhase);
    const severity = resolveReviewerSeverity(name, status.phases);

    return {
      agentId: `reviewer-${String(i)}`,
      agentRole: name,
      roleType: PHASE_ROLE_TYPE.review,
      phase: reviewPhase,
      texts,
      severity,
      staggerOffsetMs: calculateStaggerOffset(startIndex + i),
    };
  });
}
