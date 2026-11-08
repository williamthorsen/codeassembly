import path from 'node:path';

import type { HarnessSettingsResult } from '@williamthorsen/telefactor/server';
import { type Context, type Env, Hono } from 'hono';
import type { z } from 'zod';

import type { viewerConfigSchema } from '../contract/built-in-harnesses.ts';
import type { PromptDirectoryListing, PromptFileRead } from './prompt-directory.ts';
import type { PromptList } from './prompt-directory-schemas.ts';

/** The harness settings with the viewer's own keys, as `readHarnessSettings` resolves them. */
export type ViewerSettingsResult = HarnessSettingsResult<z.output<typeof viewerConfigSchema>>;

interface PromptsAppOptions<E extends Env> {
  /** Resolves the settings; called on each request, so that an edit applies at once. */
  readSettings: () => Promise<ViewerSettingsResult>;
  /** Decides whether a request may reach the routes; a rejected request gets `403`. */
  isAllowed: (context: Context<E>) => boolean;
  listPrompts: (directory: string) => Promise<PromptDirectoryListing>;
  /** Returns the text of a file in the prompts directory, if a listing of the directory names it. */
  readPromptFile: (directory: string, fileName: string) => Promise<PromptFileRead>;
}

/**
 * Creates the HTTP app that lists the prompts directory that the settings name at `/` and returns the text of a listed
 * file at `/files/:fileName`.
 */
export function createPromptsApp<E extends Env>({
  readSettings,
  isAllowed,
  listPrompts,
  readPromptFile,
}: PromptsAppOptions<E>): Hono<E> {
  const app = new Hono<E>();

  app.use(async (context, next) => {
    if (isAllowed(context)) {
      await next();
    } else {
      context.res = context.json({ error: 'The prompts routes accept only local requests.' }, 403);
    }
  });

  app.get('/', async (context) => {
    const resolved = await readSettings();
    if (!resolved.ok) return context.json({ problems: resolved.problems }, 400);
    const { configPath } = resolved;
    const directory = resolvePromptsDirectory(resolved);
    const listing = await listPrompts(directory);
    const list: PromptList = listing.ok
      ? { directory, configPath, entries: listing.entries }
      : { directory, configPath, missing: true };
    return context.json(list);
  });

  app.get('/files/:fileName', async (context) => {
    const resolved = await readSettings();
    if (!resolved.ok) return context.json({ problems: resolved.problems }, 400);
    const fileName = context.req.param('fileName');
    const read = await readPromptFile(resolvePromptsDirectory(resolved), fileName);
    if (read.ok) return context.json({ text: read.text });
    return read.reason === 'too-large'
      ? context.json({ error: `${fileName} is larger than 1 MiB.` }, 413)
      : context.json({ error: `The prompts directory does not list ${fileName}.` }, 404);
  });

  return app;
}

/** Returns the prompts directory as an absolute path, resolved against the config file's directory. */
export function resolvePromptsDirectory({ configPath, settings }: Extract<ViewerSettingsResult, { ok: true }>): string {
  return path.resolve(path.dirname(configPath), settings.app.promptsDirectory);
}
