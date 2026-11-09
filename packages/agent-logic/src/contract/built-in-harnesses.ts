import type { BuiltInHarnesses } from '@williamthorsen/telefactor/server';
import { z } from 'zod';

/** The prompts directory, relative to the config file's directory, when the config names none. */
export const DEFAULT_PROMPTS_DIRECTORY = 'prompts';

/** The harnesses that apply when neither the environment variable nor the config file defines any. */
export const viewerBuiltInHarnesses = {
  default: 'claude-code',
  harnesses: {
    'claude-code': {
      label: 'Claude Code',
      command: [
        'claude',
        '-p',
        'Run the convert-agent-prompt skill on the prompt file {prompt}, with the output path {output} and the problems path {problems}.',
        '--allowedTools',
        'Read',
        'Write',
        'Skill',
        'Bash(pnpm *)',
      ],
      test: ['claude', '-p', 'Reply with OK.'],
      interactive: ['claude'],
      mcpArgs: ['--mcp-config', '{"mcpServers":{"agent-logic":{"type":"http","url":"{mcpUrl}"}}}'],
    },
  },
} satisfies BuiltInHarnesses;

/** The viewer's own keys in `harness.config.json`: `promptsDirectory` is resolved against the file's directory. */
export const viewerConfigSchema = z.object({
  promptsDirectory: z.string().min(1, 'Name a directory').default(DEFAULT_PROMPTS_DIRECTORY),
});

/** Returns the text of a `harness.config.json` that defines the built-in settings. */
export function buildConfigTemplate(): string {
  const template = { ...viewerBuiltInHarnesses, promptsDirectory: DEFAULT_PROMPTS_DIRECTORY };
  return `${JSON.stringify(template, null, 2)}\n`;
}
