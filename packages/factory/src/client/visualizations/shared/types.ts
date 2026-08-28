import type { PhaseName, RoleType, RunStatus } from 'codeassembly-run-core';

import type { CarriedArtifact, CodeBadge } from './orchestrator-utils.js';

// Re-export visualization-agnostic types from shared utilities
export type { AgentAnimationState } from './agent-state-resolver.js';
export type { CarriedArtifact, CodeBadge } from './orchestrator-utils.js';

// -- Agent status --

/**
 * Collapsed agent status for visualization-agnostic consumers.
 * `blocked` is reserved for a future schema event and is never emitted
 * by the current mapper implementation.
 */
export type AgentStatus = 'idle' | 'working' | 'done' | 'blocked' | 'concerned';

// -- Orchestrator status --

/**
 * High-level orchestrator lifecycle state derived from run phase and status.
 * `delivering` is reserved for a future delivery-tracking schema event and
 * is never emitted by the current mapper implementation.
 */
export type OrchestratorStatus = 'idle' | 'dispatching' | 'monitoring' | 'delivering' | 'done';

// -- Artifact status --

/** Lifecycle state of an artifact in the logical scene. */
export type ArtifactStatus = 'created' | 'in_transit' | 'delivered';

// -- Logical scene state --

/** Visualization-agnostic snapshot of workflow progress. */
export interface LogicalSceneState {
  runStatus: RunStatus;
  currentPhase: PhaseName | undefined;
  agents: LogicalAgentState[];
  orchestrator: LogicalOrchestratorState;
  artifacts: LogicalArtifactState[];
}

/** Logical state for a single agent, without spatial assignment. */
export interface LogicalAgentState {
  id: string;
  role: string;
  roleType: RoleType;
  phase: PhaseName;
  status: AgentStatus;
}

/** Logical state for the orchestrator, without spatial assignment. */
export interface LogicalOrchestratorState {
  status: OrchestratorStatus;
  carriedArtifacts: CarriedArtifact[];
  codeBadge: CodeBadge | null;
  waiting: boolean;
}

/** Logical state for a single artifact, without spatial assignment. */
export interface LogicalArtifactState {
  id: string;
  label: string;
  color: string;
  status: ArtifactStatus;
  producerPhase: PhaseName;
  iteration?: number;
}
