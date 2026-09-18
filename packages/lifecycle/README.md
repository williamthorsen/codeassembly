# codeassembly-lifecycle

Canonical session-lifecycle event envelope, vocabulary, and lane fold.

This package defines the JSONL event format that instrumented skills append to the lifecycle-events root, and the pure fold that turns that log into lane and session state. Producers and consumers share it so that a log means the same thing on both sides: The `codeassembly` CLI includes the helpers that write events, and Fleet reads them back.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add codeassembly-lifecycle
```

## What it exports

| Export                                                                                                                    | Covers                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `EVENT_TYPES`, `EventEnvelope`, `EventType`, `isEventType`                                                                | The event envelope and the closed vocabulary of event types |
| `parseEventLine`                                                                                                          | Reads one line of a JSONL event log into an envelope        |
| `applyLaneEvent`, `applySessionEvent`, `createLaneState`, `createSessionState`, `deriveLaneStatus`, `deriveSessionStatus` | The fold from events to lane and session state              |
| `resolveLaneCwd`, `resolveLaneRecency`                                                                                    | Lane projections that a renderer needs                      |
| `parseTicketRef`                                                                                                          | Reads a ticket reference out of a branch name or identifier |

The fold is pure, and everything exported is browser-bundle-safe, so a client renders from the same state that a server derives.
