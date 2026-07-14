/** Session-id resolution from the harness environment, shared across skill modules. */

/** The environment variable the harness exposes the current session's id under. */
const SESSION_ID_VAR = 'CLAUDE_CODE_SESSION_ID';

/**
 * Reads the harness-supplied session id, or `undefined` when the harness exposes none. An empty value counts as absent:
 * a harness that defines the variable without populating it is telling us it has no session to name, and an empty
 * session must not reach a consumer as a real id.
 *
 * A caller that also accepts a session from its own invocation composes the precedence itself — `override ??
 * resolveSession(env)` — so the rule about which source wins stays with the caller that has more than one.
 */
export function resolveSession(env: NodeJS.ProcessEnv): string | undefined {
  const session = env[SESSION_ID_VAR];
  return session !== undefined && session.length > 0 ? session : undefined;
}
