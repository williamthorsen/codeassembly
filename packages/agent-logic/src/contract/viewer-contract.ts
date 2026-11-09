import { defineContract } from '@williamthorsen/telefactor/contract';
import { z } from 'zod';

import { agentLogicConfigSchema } from '../schema/agent-logic-schema.ts';

/** The chart that the page shows: its source line, the name under which it saves, and its config. */
export const contractChartSchema = z.object({
  source: z.string(),
  downloadName: z.string(),
  config: agentLogicConfigSchema,
});

/**
 * The state and actions that the viewer's page and an agent in its terminal share: the agent saves a prompt, converts
 * it in its own session, and loads the chart; the page publishes what it loads and selects.
 */
export const viewerContract = defineContract({
  state: z.object({
    chart: contractChartSchema.optional(),
    selectedPath: z.string().optional(),
    savedPrompt: z.object({ fileName: z.string(), path: z.string() }).optional(),
  }),
  actions: {
    save_prompt: {
      description:
        "Saves a prompt to the viewer's prompts directory as \"<name>.md\", the name reduced to lowercase letters, digits, and hyphens; refuses a name that a saved prompt or agent-logic file already uses. The state's `savedPrompt.path` is the saved file. To chart it, run the convert-agent-prompt skill on that path with its default output, which it writes beside the prompt, then call `load_chart` with the output's file name.",
      input: z.object({
        name: z.string().describe('The prompt\'s name, such as "refund triage".'),
        text: z.string().describe('The prompt text.'),
      }),
    },
    load_chart: {
      description:
        'Loads an agent-logic file from the prompts directory into the page, such as the "<name>.agent-logic.json" that convert-agent-prompt wrote beside a saved prompt, and clears the selection. Refuses a file that the directory does not list or that does not validate, naming its problems.',
      input: z.object({
        fileName: z.string().describe('A file name in the prompts directory, not a path.'),
      }),
    },
    show_chart: {
      description:
        'Shows a chart given as its config, and clears the selection. The page calls it to publish a chart that it loaded; prefer `load_chart` for a saved file.',
      input: contractChartSchema,
    },
    select_element: {
      description:
        'Selects an element of the loaded chart by its path into the config, such as `states.greeting` or `states.greeting.on["user.replied"]`, or clears the selection when `path` is omitted. Refuses a path that the chart does not contain.',
      input: z.object({ path: z.string().optional() }),
    },
  },
});
