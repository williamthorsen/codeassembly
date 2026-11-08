import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { getRequestListener, type Http2Bindings, type HttpBindings } from '@hono/node-server';
import {
  isLoopbackRequest,
  isSameOriginRequest,
  readHarnessSettings,
  readRequestHost,
} from '@williamthorsen/telefactor/server';
import { telefactor } from '@williamthorsen/telefactor/vite';
import type { Plugin } from 'vite';

import {
  DEFAULT_PROMPTS_DIRECTORY,
  viewerBuiltInHarnesses,
  viewerConfigSchema,
} from '../contract/built-in-harnesses.ts';
import { createConversionJobImplementation } from './conversion-job-implementation.ts';
import { createPromptsApp, type ViewerSettingsResult } from './create-prompts-app.ts';
import { listPromptDirectory, readPromptDirectoryFile } from './prompt-directory.ts';
import { createViewerContractImplementation } from './viewer-contract-implementation.ts';

/** The variable whose JSON argv replaces every other harness. */
export const HARNESS_COMMAND_VARIABLE = 'AGENT_LOGIC_HARNESS_COMMAND';

/** The config file, resolved against the Vite root. */
export const HARNESS_CONFIG_FILE = 'harness.config.json';

/** The path under which the prompts routes are mounted. */
export const PROMPTS_BASE_PATH = '/api/prompts';

/**
 * Creates the dev-server plugins: telefactor's harness, job, terminal, and contract routes under `/api/telefactor`,
 * running the conversion job with a directory of its own for each run under `conversionsDirectory`, and the prompts
 * routes under `/api/prompts`.
 */
export function createViewerServerPlugins({ conversionsDirectory }: { conversionsDirectory: string }): Plugin[] {
  // The contract is created before Vite resolves its root, so its actions read the root once the config is resolved.
  let root: string | undefined;
  return [
    {
      name: 'agent-logic-root',
      configResolved(config) {
        root = config.root;
      },
    },
    telefactor({
      builtIn: viewerBuiltInHarnesses,
      commandVariable: HARNESS_COMMAND_VARIABLE,
      config: viewerConfigSchema,
      configPath: HARNESS_CONFIG_FILE,
      contract: createViewerContractImplementation({
        readSettings: () => {
          if (root === undefined) throw new Error('The dev server has not resolved its root.');
          return readViewerSettings(root);
        },
      }),
      job: createConversionJobImplementation({ conversionsDirectory }),
    }),
    createPromptsServerPlugin(),
  ];
}

// region | Helpers
/** Creates the plugin that serves the prompts routes on the dev server, behind telefactor's request guards. */
function createPromptsServerPlugin(): Plugin {
  return {
    name: 'agent-logic-prompts',
    apply: 'serve',
    configureServer(server) {
      const { root } = server.config;
      // Create the default prompts directory, so that the list names a directory that exists on the first run.
      mkdirSync(path.join(root, DEFAULT_PROMPTS_DIRECTORY), { recursive: true });
      const app = createPromptsApp<{ Bindings: Http2Bindings | HttpBindings }>({
        readSettings: () => readViewerSettings(root),
        isAllowed: (context) =>
          isLoopbackRequest({
            host: readRequestHost(context.req.header('host'), context.env.incoming),
            remoteAddress: context.env.incoming.socket.remoteAddress,
          }) &&
          isSameOriginRequest({
            origin: context.req.header('origin'),
            secFetchSite: context.req.header('sec-fetch-site'),
            url: context.req.url,
          }),
        listPrompts: listPromptDirectory,
        readPromptFile: readPromptDirectoryFile,
      });
      const listener = getRequestListener((request, env) => app.fetch(request, env), { overrideGlobalObjects: false });
      server.middlewares.use(PROMPTS_BASE_PATH, (request, response) => {
        void listener(request, response);
      });
    },
  };
}

/** Resolves the harness settings and the viewer's own keys from the environment and the config file in `root`. */
function readViewerSettings(root: string): Promise<ViewerSettingsResult> {
  return readHarnessSettings({
    env: process.env,
    configPath: path.join(root, HARNESS_CONFIG_FILE),
    builtIn: viewerBuiltInHarnesses,
    commandVariable: HARNESS_COMMAND_VARIABLE,
    config: viewerConfigSchema,
  });
}
// endregion | Helpers
