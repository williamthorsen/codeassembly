import { sanitizeName } from '../../convert/sanitize-name.ts';

/** Where a chart came from. */
export type LoadOrigin =
  | { kind: 'example'; name: string; slug: string }
  | { kind: 'file'; fileName: string }
  | { kind: 'paste' }
  | { kind: 'prompt'; name: string };

/** The line that names a chart's source on the page, and the name of the agent-logic file that saves the chart. */
export interface SourceLabel {
  source: string;
  downloadName: string;
}

/** Returns the source line and the saved file's name, `{base}.agent-logic.json`, of a chart from the origin given. */
export function labelSource(origin: LoadOrigin): SourceLabel {
  const [source, base] = describe(origin);
  return { source, downloadName: `${base}.agent-logic.json` };
}

// region | Helpers
/** Returns the source line and the saved file's base name. */
function describe(origin: LoadOrigin): [string, string] {
  switch (origin.kind) {
    case 'example':
      return [`Example: ${origin.name}`, origin.slug];
    case 'file': {
      // Drop `.agent-logic` with the extension, so that saving an opened agent-logic file keeps its name.
      const base = origin.fileName.replace(/(?:\.agent-logic)?\.[^.]*$/, '');
      return [`File: ${origin.fileName}`, base === '' ? 'agent-logic' : base];
    }
    case 'paste':
      return ['Pasted JSON', 'pasted'];
    case 'prompt':
      return [`Prompt: ${origin.name}`, sanitizeName(origin.name)];
  }
}
// endregion | Helpers
