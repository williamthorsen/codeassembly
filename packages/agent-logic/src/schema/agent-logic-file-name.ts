/** The suffix that names an agent-logic file in a store and in a download. */
export const AGENT_LOGIC_SUFFIX = '.agent-logic.json';

/** Reports whether the name ends in `.agent-logic.json` after a non-empty base. */
export function isAgentLogicFileName(name: string): boolean {
  return name.length > AGENT_LOGIC_SUFFIX.length && name.endsWith(AGENT_LOGIC_SUFFIX);
}
