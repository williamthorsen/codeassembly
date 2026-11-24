import { sanitizeName } from '../../convert/sanitize-name.ts';
import { dropPromptLogicSuffix, PROMPT_LOGIC_SUFFIX } from '../../schema/prompt-logic-file-name.ts';

/** Where a chart came from. */
export type LoadOrigin =
  | { kind: 'example'; name: string; slug: string }
  | { kind: 'file'; fileName: string }
  | { kind: 'paste' }
  | { kind: 'prompt'; name: string };

/** The line that names a chart's source on the page, and the name of the prompt-logic file that saves the chart. */
export interface SourceLabel {
  source: string;
  downloadName: string;
}

/** Returns the source line and the saved file's name, `{base}.prompt-logic.json`, of a chart from the origin given. */
export function labelSource(origin: LoadOrigin): SourceLabel {
  const [source, base] = describe(origin);
  return { source, downloadName: `${base}${PROMPT_LOGIC_SUFFIX}` };
}

// region | Helpers
/** Returns the source line and the saved file's base name. */
function describe(origin: LoadOrigin): [string, string] {
  switch (origin.kind) {
    case 'example':
      return [`Example: ${origin.name}`, origin.slug];
    case 'file': {
      // Drop a prompt-logic suffix whole, so that saving an opened prompt-logic file keeps its base.
      const withoutSuffix = dropPromptLogicSuffix(origin.fileName);
      const base = withoutSuffix === origin.fileName ? origin.fileName.replace(/\.[^.]*$/, '') : withoutSuffix;
      return [`File: ${origin.fileName}`, base === '' ? 'prompt' : base];
    }
    case 'paste':
      return ['Pasted JSON', 'pasted'];
    case 'prompt':
      return [`Prompt: ${origin.name}`, sanitizeName(origin.name)];
  }
}
// endregion | Helpers
