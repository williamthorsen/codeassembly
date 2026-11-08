import { type ContractImplementation, implementContract } from '@williamthorsen/telefactor/server';

import { viewerContract } from '../contract/viewer-contract.ts';
import { sanitizeName } from '../convert/sanitize-name.ts';
import { describeConfig } from '../layout/describe-config.ts';
import { labelSource } from '../react/hooks/label-source.ts';
import { parseConfigText } from '../react/hooks/parse-config-text.ts';
import { type Problem, validateConfig } from '../schema/validate-config.ts';
import { resolvePromptsDirectory, type ViewerSettingsResult } from './create-prompts-app.ts';
import {
  listPromptDirectory,
  MAX_PROMPT_FILE_BYTES,
  readPromptDirectoryFile,
  writePromptDirectoryFile,
} from './prompt-directory.ts';

interface ViewerContractOptions {
  /** Resolves the settings; called by each action that reaches the prompts directory, so that an edit applies at once. */
  readSettings: () => Promise<ViewerSettingsResult>;
}

/**
 * Implements the viewer's contract on the dev server: the prompts-directory actions read the directory that the
 * settings name, and a refusal throws, which leaves the state unchanged and names the reason to the caller.
 */
export function createViewerContractImplementation({ readSettings }: ViewerContractOptions): ContractImplementation {
  return implementContract(viewerContract, {
    initialState: {},
    handlers: {
      save_prompt: async (state, { name, text }) => {
        if (name.trim() === '') throw new Error('Enter a name.');
        if (Buffer.byteLength(text, 'utf8') > MAX_PROMPT_FILE_BYTES) {
          throw new Error('The prompt is larger than 1 MiB, which the prompts directory does not read.');
        }
        const directory = await readDirectory(readSettings);
        const base = sanitizeName(name);
        const listing = await listPromptDirectory(directory);
        if (!listing.ok) throw new Error(`The prompts directory ${directory} does not exist.`);
        // Refuse a base that has an agent-logic file too, which converting the new prompt would overwrite.
        const taken = `The prompts directory already has files named ${base}. Choose another name.`;
        if (listing.entries.some((entry) => entry.name === base)) throw new Error(taken);
        const fileName = `${base}.md`;
        const written = await writePromptDirectoryFile(directory, fileName, text);
        if (!written.ok) throw new Error(taken);
        return { ...state, savedPrompt: { fileName, path: written.path } };
      },
      load_chart: async (state, { fileName }) => {
        const directory = await readDirectory(readSettings);
        const read = await readPromptDirectoryFile(directory, fileName);
        if (!read.ok) {
          throw new Error(
            read.reason === 'too-large'
              ? `${fileName} is larger than 1 MiB.`
              : `The prompts directory does not list ${fileName}. Pass a file name from ${directory}, not a path.`,
          );
        }
        const parsed = parseConfigText(read.text, 'file');
        if (!parsed.ok) throw new Error(formatProblems(fileName, parsed.problems));
        const validated = validateConfig(parsed.value);
        if (!validated.ok) throw new Error(formatProblems(fileName, validated.problems));
        return {
          ...state,
          chart: { ...labelSource({ kind: 'file', fileName }), config: validated.config },
          selectedPath: undefined,
        };
      },
      show_chart: (state, chart) => ({ ...state, chart, selectedPath: undefined }),
      select_element: (state, { path }) => {
        if (path === undefined) return { ...state, selectedPath: undefined };
        if (state.chart === undefined) throw new Error('No chart is loaded.');
        if (!listElementPaths(state.chart.config).has(path)) {
          throw new Error(`The loaded chart does not contain an element at ${path}.`);
        }
        return { ...state, selectedPath: path };
      },
    },
  });
}

// region | Helpers
/** Returns the problems as one message that names the file. */
function formatProblems(fileName: string, problems: Problem[]): string {
  const lines = problems.map(({ path, message }) => (path === '' ? `- ${message}` : `- ${path}: ${message}`));
  return [`${fileName} is not a valid agent-logic file:`, ...lines].join('\n');
}

/** Returns the paths of the elements that the page can select: states, transitions, and ambient instructions. */
function listElementPaths(config: Parameters<typeof describeConfig>[0]): Set<string> {
  const { states, transitions, ambient } = describeConfig(config);
  return new Set([...states, ...transitions, ...ambient].map((element) => element.path));
}

/** Returns the prompts directory that the settings name, or throws with the config file's problems. */
async function readDirectory(readSettings: () => Promise<ViewerSettingsResult>): Promise<string> {
  const resolved = await readSettings();
  if (!resolved.ok) {
    const lines = resolved.problems.map(({ path, message }) => (path === '' ? message : `${path}: ${message}`));
    throw new Error(['The harness config file has problems:', ...lines].join('\n'));
  }
  return resolvePromptsDirectory(resolved);
}
// endregion | Helpers
