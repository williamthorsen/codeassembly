// Everything exported here must stay browser-bundle-safe; the browser-bundle test enforces it.

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
  resolveLaneRecency,
  type SessionPhase,
  type SessionState,
  type SessionStatus,
} from './fold.ts';
export { type LanePath, parseEventLine, parseLanePath } from './parse.ts';
export { parseTicketRef, type TicketRef } from './ticket-ref.ts';
