// Types — canonical domain model
export type {
  ArchitecturePhase,
  ArtifactEntry,
  CanonicalRunStatus,
  CodeSimplifierPhase,
  Criticality,
  HolisticReviewPhase,
  ImplementationPhase,
  LegacyReviewPhase,
  ParallelReviewPhase,
  PhaseDecision,
  Phases,
  PhaseStatus,
  PlanningPhase,
  QualityGates,
  ReviewerInfo,
  ReviewerStatus,
  ReviewIteration,
  RunStatus,
  SelectiveReReview,
} from './types/canonical.js';

// Types — run-log event model
export type {
  ArtifactWrittenEvent,
  CoderFixCompletedEvent,
  CoderFixStartedEvent,
  EventPhaseName,
  PhaseCompletedEvent,
  PhaseDecisionEvent,
  PhaseStartedEvent,
  ReReviewCompletedEvent,
  ReReviewDispatchedEvent,
  ReviewerCompletedEvent,
  ReviewerDispatchedEvent,
  RunCompletedEvent,
  RunEvent,
  RunFailedEvent,
  RunHeader,
  RunStartedEvent,
} from './types/run-log.js';

// Constants — domain role types and phase names
export type { PhaseName, RoleType } from './constants/role-types.js';
export { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPES } from './constants/role-types.js';

// Schemas — run-index (v2)
export {
  artifactEntrySchema,
  criticalitySchema,
  phaseDecisionMapSchema,
  phaseDecisionSchema,
  phaseEntrySchema,
  phasesSchema,
  phaseStatusSchema,
  runStatusSchema,
  v2ConfigSchema,
  v2ContextSchema,
  v2RunIndexSchema,
} from './schemas/run-index-schema.js';

// Schemas — run-log (v3 events + header)
export { parseRunLogLine, runEventSchema, v3RunIndexSchema } from './schemas/run-log-schema.js';

// Schemas — status.json (v1)
export { v1StatusSchema } from './schemas/status-json-schema.js';

// Event folder — reconstruct CanonicalRunStatus from header + events
export { foldEvents } from './event-folder.js';

// Parsers — read and parse run data from disk
export { parseRunData, parseStatusFile } from './parsers/run-data-parser.js';
