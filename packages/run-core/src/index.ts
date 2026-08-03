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
  UsageMetrics,
  WaitingForInputReason,
} from './types/canonical.ts';

// Types — run-log event model
export type {
  ArtifactWrittenEvent,
  CoderFixCompletedEvent,
  CoderFixStartedEvent,
  EventPhaseName,
  EventUsageFields,
  InputReceivedEvent,
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
  WaitingForInputEvent,
} from './types/run-log.ts';

// Constants — domain role types and phase names
export type { PhaseName, RoleType } from './constants/role-types.ts';
export { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPES } from './constants/role-types.ts';

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
} from './schemas/run-index-schema.ts';

// Schemas — run-log (v3 events + header)
export { parseRunLogLine, runEventSchema, v3RunIndexSchema } from './schemas/run-log-schema.ts';

// Schemas — status.json (v1)
export { v1StatusSchema } from './schemas/status-json-schema.ts';

// Errors — structured parse error class
export type { RunDataParseErrorCategory } from './run-data-parse-error.ts';
export { RunDataParseError } from './run-data-parse-error.ts';

// Event folder — reconstruct CanonicalRunStatus from header + events
export { foldEvents } from './event-folder.ts';

// Type guards
export { isEnoent } from './type-guards.ts';

// Parsers are NOT exported from the root entry point because they use Node.js
// APIs (node:fs/promises, node:path) that are incompatible with browser builds.
// Import parsers from 'codeassembly-run-core/parsers' instead.
