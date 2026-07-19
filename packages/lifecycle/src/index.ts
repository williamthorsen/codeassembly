// Public surface of @codeassembly/lifecycle: the canonical envelope and vocabulary, tolerant parsers, ticket-ref
// derivation, and the pure lane fold. Everything exported here is browser-bundle-safe.

export { EVENT_TYPES, type EventEnvelope, type EventType, isEventType } from './envelope.ts';
export {
  applyLaneEvent,
  applySessionEvent,
  createLaneState,
  createSessionState,
  deriveLaneStatus,
  deriveSessionStatus,
  type LaneClosureReason,
  type LaneProbes,
  type LaneState,
  type LaneStatus,
  type SessionPhase,
  type SessionState,
  type SessionStatus,
} from './fold.ts';
export { type LanePath, parseEventLine, parseLanePath } from './parse.ts';
export { parseTicketRef, type TicketRef } from './ticket-ref.ts';
