import type { Edge, Node } from '@xyflow/react';

import type { PhaseName, RoleType } from '../../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
import { findCurrentPhase, isPhasePresentInData } from '../../../../shared/phase-inference.js';
import type {
  CanonicalRunStatus,
  Criticality,
  ParallelReviewPhase,
  Phases,
  QualityGates,
} from '../../../../shared/types/canonical.js';

export interface FlowNodeData extends Record<string, unknown> {
  role: string;
  roleType: string;
  agentId: string;
  status: 'idle' | 'working' | 'completed' | 'failed' | 'skipped';
  phase: string;
  label: string;
  // Orchestrator-specific
  currentPhaseName?: string;
  runStatus?: string;
  // Reviewer-specific
  criticality?: string;
  reReviewCriticality?: string;
  // Metadata badges for PhaseAgentNode
  impactLevel?: string;
  stepCount?: number;
  qualityGates?: QualityGates | string;
  // CoderShadowNode
  fixIteration?: number;
}

/** Data attached to dispatch edges (orchestrator -> agent and agent -> orchestrator). */
export interface DispatchEdgeData extends Record<string, unknown> {
  roleType: RoleType;
  color: string;
  status: 'completed' | 'pending';
  iteration: number;
  isNew: boolean;
}

/** Data attached to return edges (reviewer -> orchestrator), extending dispatch with criticality. */
export interface ReturnEdgeData extends DispatchEdgeData {
  criticality: Criticality | undefined;
  reReviewCriticality: Criticality | undefined;
}

/** Data attached to spine edges (orchestrator -> orchestrator between phases). */
export interface SpineEdgeData extends Record<string, unknown> {
  status: 'completed' | 'pending';
}

interface PhaseColumn {
  x: number;
  width: number;
}

const PHASE_COLUMNS: Record<PhaseName, PhaseColumn> = {
  architecture: { x: 100, width: 220 },
  planning: { x: 340, width: 220 },
  implementation: { x: 580, width: 220 },
  review: { x: 820, width: 350 },
  simplifier: { x: 1190, width: 220 },
  holistic: { x: 1430, width: 220 },
  summary: { x: 1670, width: 220 },
};

/**
 * Check that a value is neither null nor undefined. The Phases type uses
 * `| undefined` but runtime data from Zod can carry `null` phase values.
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/** Narrow an unknown value to a non-null object (safe for `Object.keys`). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Check whether a phase should produce an agent based on existing data or inference. */
function shouldShowPhaseAgent(phase: PhaseName, phases: Phases, currentPhase?: PhaseName): boolean {
  if (currentPhase === phase) return true;
  return isPhasePresentInData(phase, phases);
}

/** Derive status from optional startedAt/completedAt timestamps. */
function statusFromTimestamps(startedAt?: string, completedAt?: string): FlowNodeData['status'] {
  if (completedAt !== undefined) return 'completed';
  if (startedAt !== undefined) return 'working';
  return 'idle';
}

/**
 * Determine a node's status based on the phase data.
 * For the summary phase, check the overall run status instead.
 */
function resolvePhaseNodeStatus(
  phase: PhaseName,
  phases: Phases,
  runStatus: string,
  currentPhase?: PhaseName,
): FlowNodeData['status'] {
  if (runStatus === 'failed') return 'failed';

  if (phase === 'summary') {
    return runStatus === 'completed' ? 'completed' : 'idle';
  }

  if (currentPhase === phase) return 'working';

  return resolvePhaseTimestampStatus(phase, phases);
}

/** Look up phase-specific timestamps and derive status. */
function resolvePhaseTimestampStatus(phase: PhaseName, phases: Phases): FlowNodeData['status'] {
  switch (phase) {
    case 'architecture':
      return statusFromTimestamps(phases.architecture?.startedAt, phases.architecture?.completedAt);
    case 'planning':
      return statusFromTimestamps(phases.planning?.startedAt, phases.planning?.completedAt);
    case 'implementation':
      return statusFromTimestamps(phases.implementation?.startedAt, phases.implementation?.completedAt);
    case 'review':
      if (isPresent(phases.parallelReview)) {
        return statusFromTimestamps(phases.parallelReview.startedAt, phases.parallelReview.completedAt);
      }
      return 'idle';
    case 'simplifier':
      return statusFromTimestamps(phases.codeSimplifier?.startedAt, phases.codeSimplifier?.completedAt);
    case 'holistic':
      return statusFromTimestamps(phases.holisticReview?.startedAt, phases.holisticReview?.completedAt);
    default:
      return 'idle';
  }
}

/**
 * Extract reviewer names from any known parallelReview data shape.
 *
 * The orchestrate skill evolved its run-index.json format, producing three
 * known shapes for the parallelReview phase:
 *   1. Flat `reviewers` record (older runs) -- keyed by reviewer name
 *   2. `iterations[].perReviewer` records -- keyed by reviewer name
 *   3. Top-level `reviewerDetails` record -- keyed by reviewer name
 */
function extractReviewerNames(parallelReview: ParallelReviewPhase): string[] {
  // Shape 1: flat reviewers record (canonical typed shape)
  const reviewers = parallelReview.reviewers;
  if (isPresent(reviewers) && Object.keys(reviewers).length > 0) {
    return Object.keys(reviewers);
  }

  // Shape 2: iterations[].perReviewer (passes through Zod .loose())
  const iterations = parallelReview.iterations;
  if (isPresent(iterations) && iterations.length > 0) {
    const names = new Set<string>();
    for (const iteration of iterations) {
      // perReviewer is an untyped property that passes through Zod .loose()
      if ('perReviewer' in iteration) {
        const perReviewer: unknown = iteration.perReviewer;
        if (isRecord(perReviewer)) {
          for (const name of Object.keys(perReviewer)) {
            names.add(name);
          }
        }
      }
      // Also collect from the typed reviewers: string[] array
      if (Array.isArray(iteration.reviewers)) {
        for (const name of iteration.reviewers) {
          names.add(name);
        }
      }
    }
    if (names.size > 0) return Array.from(names);
  }

  // Shape 3: top-level reviewerDetails (passes through Zod .loose())
  if ('reviewerDetails' in parallelReview) {
    const reviewerDetails: unknown = parallelReview.reviewerDetails;
    if (isRecord(reviewerDetails)) {
      const keys = Object.keys(reviewerDetails);
      if (keys.length > 0) return keys;
    }
  }

  return [];
}

/** Build phase agent nodes for each active phase. */
function buildPhaseAgentNodes(phases: Phases, runStatus: string, currentPhase?: PhaseName): Node<FlowNodeData>[] {
  const nodes: Node<FlowNodeData>[] = [];

  for (const phase of PHASE_NAMES) {
    if (phase === 'summary') continue;

    // Skipped phases are handled by buildGhostNodes
    if (!shouldShowPhaseAgent(phase, phases, currentPhase)) continue;

    const column = PHASE_COLUMNS[phase];
    const nodeStatus = resolvePhaseNodeStatus(phase, phases, runStatus, currentPhase);
    const roleType = PHASE_ROLE_TYPE[phase];

    nodes.push({
      id: `agent-${phase}`,
      type: 'phaseAgent',
      position: { x: column.x + column.width / 2 - 60, y: 100 },
      data: {
        role: PHASE_ROLE[phase],
        roleType,
        agentId: `agent-${phase}`,
        status: nodeStatus,
        phase,
        label: PHASE_ROLE[phase],
        ...(phase === 'architecture' && phases.architecture?.impactLevel !== undefined
          ? { impactLevel: phases.architecture.impactLevel }
          : {}),
        ...(phase === 'planning' && phases.planning?.stepCount !== undefined
          ? { stepCount: phases.planning.stepCount }
          : {}),
        ...(phase === 'implementation' && phases.implementation?.qualityGates !== undefined
          ? { qualityGates: phases.implementation.qualityGates }
          : {}),
      },
    });
  }

  return nodes;
}

/** Build reviewer nodes with vertical fan-out. */
function buildReviewerNodes(phases: Phases): Node<FlowNodeData>[] {
  const nodes: Node<FlowNodeData>[] = [];
  const reviewColumn = PHASE_COLUMNS.review;

  if (!isPresent(phases.parallelReview)) return nodes;

  const reviewerNames = extractReviewerNames(phases.parallelReview);
  if (reviewerNames.length === 0) return nodes;

  for (const [i, name] of reviewerNames.entries()) {
    const reviewerInfo = phases.parallelReview.reviewers[name];
    nodes.push({
      id: `reviewer-${name}`,
      type: 'reviewer',
      position: { x: reviewColumn.x + reviewColumn.width / 2 - 60, y: 60 + i * 80 },
      data: {
        role: name,
        roleType: PHASE_ROLE_TYPE.review,
        agentId: `reviewer-${name}`,
        status: resolveReviewerStatus(phases.parallelReview, name),
        phase: 'review',
        label: name,
        ...(reviewerInfo?.criticality === undefined ? {} : { criticality: reviewerInfo.criticality }),
        ...(reviewerInfo?.reReviewCriticality === undefined
          ? {}
          : { reReviewCriticality: reviewerInfo.reReviewCriticality }),
      },
    });
  }

  return nodes;
}

function resolveReviewerStatus(parallelReview: ParallelReviewPhase, reviewerName: string): FlowNodeData['status'] {
  const reviewerInfo = parallelReview.reviewers[reviewerName];
  if (reviewerInfo === undefined) return 'idle';
  if (reviewerInfo.status === 'completed') return 'completed';
  if (reviewerInfo.status === 'failed') return 'failed';
  if (reviewerInfo.status === 'skipped') return 'skipped';
  return 'working';
}

/** Build coder shadow node when coder fix cycle ran during review. */
function buildCoderShadowNode(phases: Phases): Node<FlowNodeData>[] {
  if (phases.parallelReview?.coderFixCycleRan !== true) return [];

  const reviewColumn = PHASE_COLUMNS.review;

  return [
    {
      id: 'coder-shadow',
      type: 'coderShadow',
      position: { x: reviewColumn.x + reviewColumn.width / 2 - 60, y: 340 },
      data: {
        role: 'coder (fix cycle)',
        roleType: PHASE_ROLE_TYPE.implementation,
        agentId: 'coder-shadow',
        status: 'completed',
        phase: 'review',
        label: 'coder (fix)',
        fixIteration: phases.parallelReview.reviewRoundsUsed,
      },
    },
  ];
}

/** Build the orchestrator node positioned at the appropriate column. */
function buildOrchestratorNode(status: CanonicalRunStatus, currentPhase?: PhaseName): Node<FlowNodeData>[] {
  let column: PhaseColumn;
  let nodeStatus: FlowNodeData['status'];

  if (status.status === 'completed') {
    column = PHASE_COLUMNS.summary;
    nodeStatus = 'completed';
  } else if (status.status === 'in_progress') {
    const phase = currentPhase ?? 'architecture';
    column = PHASE_COLUMNS[phase];
    nodeStatus = 'working';
  } else {
    // Failed or needs_manual_review -- no orchestrator
    return [];
  }

  return [
    {
      id: 'orchestrator',
      type: 'orchestrator',
      position: { x: column.x + column.width / 2 - 60, y: 0 },
      data: {
        role: 'orchestrator',
        roleType: PHASE_ROLE_TYPE.summary,
        agentId: 'orchestrator',
        status: nodeStatus,
        phase: currentPhase ?? 'summary',
        label: 'orchestrator',
        currentPhaseName: currentPhase ?? 'summary',
        runStatus: status.status,
      },
    },
  ];
}

/** Build ghost nodes for skipped phases. */
function buildGhostNodes(
  phaseDecisions: Record<string, { run: boolean; reason: string | undefined }> | undefined,
): Node<FlowNodeData>[] {
  if (phaseDecisions === undefined) return [];

  const nodes: Node<FlowNodeData>[] = [];

  for (const phase of PHASE_NAMES) {
    if (phase === 'summary') continue;

    const decision = phaseDecisions[phase];
    if (decision === undefined || decision.run) continue;

    const column = PHASE_COLUMNS[phase];

    nodes.push({
      id: `ghost-${phase}`,
      type: 'skippedPhase',
      position: { x: column.x + column.width / 2 - 60, y: 100 },
      data: {
        role: PHASE_ROLE[phase],
        roleType: PHASE_ROLE_TYPE[phase],
        agentId: `ghost-${phase}`,
        status: 'skipped',
        phase,
        label: `${PHASE_ROLE[phase]} (skipped)`,
      },
    });
  }

  return nodes;
}

/** Build the orchestrator spine edges connecting consecutive phase columns. */
function buildSpineEdges(phases: Phases, runStatus: string, currentPhase?: PhaseName): Edge<SpineEdgeData>[] {
  const edges: Edge<SpineEdgeData>[] = [];
  const activePhases: PhaseName[] = [];

  for (const phase of PHASE_NAMES) {
    if (phase === 'summary' && runStatus !== 'completed') continue;
    if (shouldShowPhaseAgent(phase, phases, currentPhase) || runStatus === 'completed') {
      activePhases.push(phase);
    }
  }

  const spineStatus: SpineEdgeData['status'] = runStatus === 'in_progress' ? 'pending' : 'completed';

  for (let i = 0; i < activePhases.length - 1; i++) {
    const source = activePhases[i];
    const target = activePhases[i + 1];
    if (source === undefined || target === undefined) continue;

    edges.push({
      id: `spine-${source}-${target}`,
      source: 'orchestrator',
      target: 'orchestrator',
      sourceHandle: `spine-out-${source}`,
      targetHandle: `spine-in-${target}`,
      type: 'spine',
      data: { status: spineStatus },
    });
  }

  return edges;
}

/** Build dispatch and return edges between the orchestrator and phase agents. */
function buildDispatchEdges(phases: Phases, runStatus: string, currentPhase?: PhaseName): Edge<DispatchEdgeData>[] {
  const edges: Edge<DispatchEdgeData>[] = [];

  for (const phase of PHASE_NAMES) {
    if (phase === 'summary') continue;
    if (!shouldShowPhaseAgent(phase, phases, currentPhase)) continue;

    // Skip review; handled by reviewer-specific edges
    if (phase === 'review') continue;

    const isCompleted = resolvePhaseNodeStatus(phase, phases, runStatus, currentPhase) === 'completed';
    const roleType = PHASE_ROLE_TYPE[phase];
    const color = ROLE_TYPE_COLORS[roleType];
    const edgeStatus: DispatchEdgeData['status'] = isCompleted ? 'completed' : 'pending';

    // Dispatch edge: orchestrator -> agent
    edges.push(
      {
        id: `dispatch-${phase}`,
        source: 'orchestrator',
        target: `agent-${phase}`,
        type: 'dispatch',
        data: {
          roleType,
          color,
          status: edgeStatus,
          iteration: 1,
          isNew: false,
        },
      },
      {
        id: `return-${phase}`,
        source: `agent-${phase}`,
        target: 'orchestrator',
        type: 'dispatch',
        data: {
          roleType,
          color,
          status: edgeStatus,
          iteration: 1,
          isNew: false,
        },
      },
    );
  }

  return edges;
}

/** Build reviewer-specific dispatch and return edges. */
function buildReviewerEdges(phases: Phases): Array<Edge<DispatchEdgeData> | Edge<ReturnEdgeData>> {
  const edges: Array<Edge<DispatchEdgeData> | Edge<ReturnEdgeData>> = [];

  if (!isPresent(phases.parallelReview)) return edges;

  const reviewerNames = extractReviewerNames(phases.parallelReview);
  const roleType = PHASE_ROLE_TYPE.review;
  const color = ROLE_TYPE_COLORS[roleType];

  for (const name of reviewerNames) {
    const reviewerInfo = phases.parallelReview.reviewers[name];
    const isCompleted = reviewerInfo?.status === 'completed';
    const edgeStatus: DispatchEdgeData['status'] = isCompleted ? 'completed' : 'pending';

    // Dispatch edge: orchestrator -> reviewer
    const dispatchEdge: Edge<DispatchEdgeData> = {
      id: `dispatch-reviewer-${name}`,
      source: 'orchestrator',
      target: `reviewer-${name}`,
      type: 'dispatch',
      data: {
        roleType,
        color,
        status: edgeStatus,
        iteration: 1,
        isNew: false,
      },
    };

    // Return edge: reviewer -> orchestrator (with criticality)
    const returnEdge: Edge<ReturnEdgeData> = {
      id: `return-reviewer-${name}`,
      source: `reviewer-${name}`,
      target: 'orchestrator',
      type: 'dispatch',
      data: {
        roleType,
        color,
        status: edgeStatus,
        iteration: 1,
        isNew: false,
        criticality: reviewerInfo?.criticality,
        reReviewCriticality: reviewerInfo?.reReviewCriticality,
      },
    };

    edges.push(dispatchEdge, returnEdge);
  }

  return edges;
}

/** Build coder fix edge when coderFixCycleRan is true. */
function buildCoderFixEdge(phases: Phases): Edge<DispatchEdgeData>[] {
  if (phases.parallelReview?.coderFixCycleRan !== true) return [];

  const roleType = PHASE_ROLE_TYPE.implementation;
  const color = ROLE_TYPE_COLORS[roleType];

  return [
    {
      id: 'dispatch-coder-fix',
      source: 'orchestrator',
      target: 'coder-shadow',
      type: 'dispatch',
      data: {
        roleType,
        color,
        status: 'completed',
        iteration: 1,
        isNew: false,
      },
    },
  ];
}

export function createFlowConfig(status: CanonicalRunStatus): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);

  const phaseAgentNodes = buildPhaseAgentNodes(status.phases, status.status, currentPhase);
  const reviewerNodes = buildReviewerNodes(status.phases);
  const coderShadowNodes = buildCoderShadowNode(status.phases);
  const orchestratorNodes = buildOrchestratorNode(status, currentPhase);
  const ghostNodes = buildGhostNodes(status.phaseDecisions);

  // Remove phase agent nodes for review (replaced by individual reviewer nodes)
  const filteredPhaseNodes = phaseAgentNodes.filter((n) => n.id !== 'agent-review');

  const nodes: Node<FlowNodeData>[] = [
    ...filteredPhaseNodes,
    ...reviewerNodes,
    ...coderShadowNodes,
    ...orchestratorNodes,
    ...ghostNodes,
  ];

  // Edges referencing the orchestrator node are only valid when the orchestrator
  // node exists. For failed/needs_manual_review runs, buildOrchestratorNode
  // returns no nodes, so we skip all orchestrator-referencing edges.
  const hasOrchestrator = orchestratorNodes.length > 0;

  const spineEdges = hasOrchestrator ? buildSpineEdges(status.phases, status.status, currentPhase) : [];
  const dispatchEdges = hasOrchestrator ? buildDispatchEdges(status.phases, status.status, currentPhase) : [];
  const reviewerEdges = hasOrchestrator ? buildReviewerEdges(status.phases) : [];
  const coderFixEdges = hasOrchestrator ? buildCoderFixEdge(status.phases) : [];

  const edges: Edge[] = [...spineEdges, ...dispatchEdges, ...reviewerEdges, ...coderFixEdges];

  return { nodes, edges };
}
