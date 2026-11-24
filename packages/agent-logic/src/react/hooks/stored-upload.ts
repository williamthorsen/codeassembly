import { dropPromptLogicSuffix, PROMPT_LOGIC_SUFFIX } from '../../schema/prompt-logic-file-name.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import type { InputOrigin } from './document-types.ts';
import { dropLastExtension, sanitizeStoredBase } from './stored-base.ts';

/**
 * Returns the name under which an upload is stored: a dropped or picked file's name, with `.prompt-logic.json` in place
 * of its last extension or of a prompt-logic suffix, or a pasted config's `id`, each with its base sanitized into a name that the store accepts.
 */
export function buildStoredUploadName(origin: InputOrigin, config: AgentLogicConfig): string {
  const base = origin.kind === 'file' ? findFileBase(origin.fileName) : dropPromptLogicSuffix(config.id);
  return `${sanitizeStoredBase(base, FALLBACK_BASE)}${PROMPT_LOGIC_SUFFIX}`;
}

/** Returns the text that is stored for an upload: its parsed JSON, re-serialized without any Markdown code fence. */
export function buildStoredUploadText(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

// region | Helpers
/** The base that a name sanitizes to when none of its characters remains. */
const FALLBACK_BASE = 'prompt';

/** Returns a file name without a prompt-logic suffix, or else without its last extension when a base precedes it. */
function findFileBase(fileName: string): string {
  const base = dropPromptLogicSuffix(fileName);
  return base === fileName ? dropLastExtension(fileName) : base;
}
// endregion | Helpers
