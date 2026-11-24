import { dropPromptLogicSuffix, isPromptLogicFileName } from '../../schema/prompt-logic-file-name.ts';

/** Returns the name that a stored prompt-logic file is shown by: its name without its suffix, or the name. */
export function nameStoredFile(fileName: string): string {
  return isPromptLogicFileName(fileName) ? dropPromptLogicSuffix(fileName) : fileName;
}
