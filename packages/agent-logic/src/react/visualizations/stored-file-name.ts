import { AGENT_LOGIC_SUFFIX, isAgentLogicFileName } from '../../schema/agent-logic-file-name.ts';

/** Returns the name that a stored agent-logic file is shown by: its name without `.agent-logic.json`, or the name. */
export function nameStoredFile(fileName: string): string {
  return isAgentLogicFileName(fileName) ? fileName.slice(0, -AGENT_LOGIC_SUFFIX.length) : fileName;
}
