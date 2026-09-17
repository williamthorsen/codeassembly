import type { HarnessId } from '../lib/types.ts';
import type { HookMapping } from './types.ts';

/**
 * Every hook served by the relay, keyed by harness and then by the harness's own name for the hook.
 *
 * Only the four session and turn boundaries are relayed. The tool-level hooks (`PreToolUse`/`PostToolUse`,
 * `on_tool_start`/`on_tool_end`) would fill the log with detail that no watching surface renders, and Claude's
 * `Notification` overlaps the waiting signal that `Stop` already provides.
 *
 * Neither harness relays the prompt text: A turn boundary is a status signal, and the event log serves surfaces that
 * show what a session is doing rather than what was said to it.
 */
const HOOK_MAPPINGS: Readonly<Record<HarnessId, Readonly<Record<string, HookMapping>>>> = {
  claude: {
    SessionStart: { type: 'session.started', discriminators: ['source'] },
    SessionEnd: { type: 'session.ended', discriminators: ['reason'] },
    UserPromptSubmit: { type: 'turn.started', discriminators: [] },
    Stop: { type: 'turn.completed', discriminators: [] },
  },
  rovo: {
    // `on_session_end` covers exit, session switch, and fork alike, so what distinguishes them is inside
    // `attributes`.
    on_session_start: { type: 'session.started', discriminators: ['attributes'] },
    on_session_end: { type: 'session.ended', discriminators: ['attributes'] },
    on_user_prompt: { type: 'turn.started', discriminators: [] },
    on_complete: { type: 'turn.completed', discriminators: [] },
  },
};

/** Names every harness served by the relay. */
export function listRelayHarnesses(): readonly string[] {
  return Object.keys(HOOK_MAPPINGS);
}

/**
 * The hook names that the relay serves for `harness`, in table order. Because configured hook entries are composed
 * from this list, they cannot drift from the hooks that the relay serves.
 */
export function listRelayHooks(harness: HarnessId): readonly string[] {
  return Object.keys(HOOK_MAPPINGS[harness]);
}

/**
 * The mapping for `hook` under `harness`, or `undefined` when the table does not contain the name. An unknown name is an
 * ordinary outcome rather than an error.
 */
export function resolveHookMapping(input: { harness: HarnessId; hook: string }): HookMapping | undefined {
  return HOOK_MAPPINGS[input.harness][input.hook];
}

/** True when `value` names a harness served by the relay. */
export function isRelayHarness(value: string): value is HarnessId {
  return Object.hasOwn(HOOK_MAPPINGS, value);
}
