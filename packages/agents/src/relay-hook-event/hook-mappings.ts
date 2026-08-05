/** The static table binding each harness's event hooks to the lifecycle events they relay as. */
import type { HarnessId } from '../lib/types.ts';
import type { HookMapping } from './types.ts';

/**
 * Every hook the relay serves, keyed by harness and then by the harness's own name for the hook.
 *
 * Only the four session and turn boundaries are relayed. The tool-level hooks (`PreToolUse`/`PostToolUse`,
 * `on_tool_start`/`on_tool_end`) would flood the log with detail no watching surface renders, and Claude's
 * `Notification` overlaps the waiting signal `Stop` already carries.
 *
 * The prompt text itself is deliberately not relayed, on either harness: a turn boundary is a status signal, and the
 * event log is read by surfaces that show what a session is doing — not what was said to it.
 */
const HOOK_MAPPINGS: Readonly<Record<HarnessId, Readonly<Record<string, HookMapping>>>> = {
  claude: {
    SessionStart: { type: 'session.started', discriminators: ['source'] },
    SessionEnd: { type: 'session.ended', discriminators: ['reason'] },
    UserPromptSubmit: { type: 'turn.started', discriminators: [] },
    Stop: { type: 'turn.completed', discriminators: [] },
  },
  rovo: {
    // Rovo carries its per-event detail in an `attributes` object rather than at the payload's top level, and
    // `on_session_end` covers exit, session switch, and fork alike — so what distinguishes them is inside `attributes`.
    on_session_start: { type: 'session.started', discriminators: ['attributes'] },
    on_session_end: { type: 'session.ended', discriminators: ['attributes'] },
    on_user_prompt: { type: 'turn.started', discriminators: [] },
    on_complete: { type: 'turn.completed', discriminators: [] },
  },
};

/** Names every harness the relay serves, for a diagnostic that has to list them. */
export function listRelayHarnesses(): readonly string[] {
  return Object.keys(HOOK_MAPPINGS);
}

/**
 * The hook names the relay serves for `harness`, in table order. The hook-entry catalog composes the configured
 * entries from this list, so the entries a harness config carries and the hooks this relay answers cannot drift apart.
 */
export function listRelayHooks(harness: HarnessId): readonly string[] {
  return Object.keys(HOOK_MAPPINGS[harness]);
}

/**
 * The mapping for `hook` under `harness`, or `undefined` when the table does not know the name. An unknown name is an
 * ordinary outcome rather than an error: a harness config is a durable user-curated file that can name a hook this
 * version's table has not caught up with, or has stopped serving.
 */
export function resolveHookMapping(input: { harness: HarnessId; hook: string }): HookMapping | undefined {
  return HOOK_MAPPINGS[input.harness][input.hook];
}

/** True when `value` names a harness the relay serves; narrows a raw `--harness` value to a `HarnessId`. */
export function isRelayHarness(value: string): value is HarnessId {
  return Object.hasOwn(HOOK_MAPPINGS, value);
}
