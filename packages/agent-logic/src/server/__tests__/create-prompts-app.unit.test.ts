import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createPromptsApp, type ViewerSettingsResult } from '../create-prompts-app.ts';
import type { PromptDirectoryListing, PromptFileRead } from '../prompt-directory.ts';
import { promptFileSchema, promptListSchema } from '../prompt-directory-schemas.ts';

const CONFIG_PATH = '/app/harness.config.json';

const LISTING: PromptDirectoryListing = {
  ok: true,
  entries: [{ name: 'refund', promptFile: 'refund.md', agentLogicFile: 'refund.agent-logic.json' }],
};

const SETTINGS: ViewerSettingsResult = {
  ok: true,
  source: 'file',
  configPath: CONFIG_PATH,
  hasConfigFile: true,
  settings: {
    default: 'echo',
    timeoutMinutes: 2,
    harnesses: { echo: { command: ['echo'] } },
    app: { promptsDirectory: '../shared/prompts' },
  },
};

const errorBodySchema = z.object({ error: z.string() });

describe(createPromptsApp, () => {
  it('lists the directory that the settings name, resolved against the config file, with that file', async () => {
    const directories: string[] = [];
    const app = createApp({
      listPrompts: (directory) => {
        directories.push(directory);
        return Promise.resolve(LISTING);
      },
    });

    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(promptListSchema.parse(await response.json())).toStrictEqual({
      directory: '/shared/prompts',
      configPath: CONFIG_PATH,
      entries: [{ name: 'refund', promptFile: 'refund.md', agentLogicFile: 'refund.agent-logic.json' }],
    });
    expect(directories).toStrictEqual(['/shared/prompts']);
  });

  it('reports a directory that does not exist', async () => {
    const app = createApp({ listPrompts: () => Promise.resolve({ ok: false, reason: 'missing' }) });

    const response = await app.request('/');

    expect(promptListSchema.parse(await response.json())).toStrictEqual({
      directory: '/shared/prompts',
      configPath: CONFIG_PATH,
      missing: true,
    });
  });

  it.each(['/', '/files/refund.md'])('answers %s with 400 and the problems of a malformed config', async (route) => {
    const problems = [{ path: 'timeoutMinutes', message: 'Too big.' }];
    const app = createApp({
      readSettings: () => Promise.resolve({ ok: false, source: 'file', configPath: CONFIG_PATH, problems }),
    });

    const response = await app.request(route);

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({ problems });
  });

  it('returns the text of a listed file', async () => {
    const response = await createApp().request('/files/refund.md');

    expect(response.status).toBe(200);
    expect(promptFileSchema.parse(await response.json())).toStrictEqual({ text: 'Greet.' });
  });

  it.each([
    ['an unlisted file', '/files/other.md', 404],
    ['an encoded traversal', `/files/${encodeURIComponent('../package.json')}`, 404],
    ['a file over 1 MiB', '/files/huge.md', 413],
  ])('refuses %s', async (_condition, route, status) => {
    const response = await createApp().request(route);

    expect(response.status).toBe(status);
    expect(errorBodySchema.safeParse(await response.json()).success).toBe(true);
  });

  it.each(['/', '/files/refund.md'])('refuses %s to a request that is not allowed', async (route) => {
    const response = await createApp({ isAllowed: () => false }).request(route);

    expect(response.status).toBe(403);
  });
});

// region | Helpers
/** Creates the app with the given options, defaulting to `SETTINGS`, `LISTING`, and every request allowed. */
function createApp({
  readSettings = () => Promise.resolve(SETTINGS),
  isAllowed = () => true,
  listPrompts = () => Promise.resolve(LISTING),
}: {
  readSettings?: () => Promise<ViewerSettingsResult>;
  isAllowed?: () => boolean;
  listPrompts?: (directory: string) => Promise<PromptDirectoryListing>;
} = {}): ReturnType<typeof createPromptsApp> {
  return createPromptsApp({
    readSettings,
    isAllowed,
    listPrompts,
    readPromptFile: (_directory, fileName) => Promise.resolve(readFakePromptFile(fileName)),
  });
}

/** Returns `refund.md` and `huge.md` as `readPromptDirectoryFile` would: the first's text, the second too large. */
function readFakePromptFile(fileName: string): PromptFileRead {
  if (fileName === 'refund.md') return { ok: true, text: 'Greet.' };
  if (fileName === 'huge.md') return { ok: false, reason: 'too-large' };
  return { ok: false, reason: 'not-listed' };
}
// endregion | Helpers
