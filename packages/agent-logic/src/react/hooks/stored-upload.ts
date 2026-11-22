import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { AGENT_LOGIC_SUFFIX } from './agent-logic-file-name.ts';
import type { InputOrigin } from './document-types.ts';
import { dropLastExtension, sanitizeStoredBase } from './stored-base.ts';

/**
 * Returns the name under which an upload is stored: a dropped or picked file's name, with `.agent-logic.json` in place
 * of its last extension, or a pasted config's `id`, each with its base sanitized into a name that the store accepts.
 */
export function buildStoredUploadName(origin: InputOrigin, config: AgentLogicConfig): string {
  const base = origin.kind === 'file' ? findFileBase(origin.fileName) : dropSuffix(config.id);
  return `${sanitizeStoredBase(base, FALLBACK_BASE)}${AGENT_LOGIC_SUFFIX}`;
}

/** Returns the text that is stored for an upload: its parsed JSON, re-serialized without any Markdown code fence. */
export function buildStoredUploadText(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

// region | Helpers
/** The base that a name sanitizes to when none of its characters remains. */
const FALLBACK_BASE = 'agent';

/** Returns the name without a trailing `.agent-logic.json`, or the name itself. */
function dropSuffix(name: string): string {
  return name.endsWith(AGENT_LOGIC_SUFFIX) ? name.slice(0, -AGENT_LOGIC_SUFFIX.length) : name;
}

/** Returns a file name without `.agent-logic.json`, or else without its last extension when a base precedes it. */
function findFileBase(fileName: string): string {
  return fileName.endsWith(AGENT_LOGIC_SUFFIX) ? dropSuffix(fileName) : dropLastExtension(fileName);
}
// endregion | Helpers
