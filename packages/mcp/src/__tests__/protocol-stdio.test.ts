import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../cli.ts');

/** Type guard: narrows unknown to Record<string, unknown>. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('stdio transport smoke test', { timeout: 20_000 }, () => {
  it('spawns MCP server subprocess and calls init_run successfully', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx/esm', cliPath],
    });

    const client = new Client({ name: 'smoke-test', version: '0.0.1' });
    await client.connect(transport);

    try {
      // Verify tool discovery
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(5);

      // Call init_run
      const tmpDir = await mkdtemp(join(tmpdir(), 'mcp-stdio-smoke-'));
      const result = await client.callTool({
        name: 'init_run',
        arguments: {
          projectSlug: 'smoke-test',
          projectRoot: tmpDir,
          branch: 'main',
          task: 'smoke test',
        },
      });

      // Verify no error
      const hasError = 'isError' in result && result.isError === true;
      expect(hasError).toBe(false);

      // Parse and verify runId by treating result as unknown to sidestep
      // the SDK's complex content union type
      const raw: unknown = result;
      if (!isRecord(raw)) throw new Error('Expected result to be an object');
      const contentArray = raw.content;
      if (!Array.isArray(contentArray)) throw new Error('Expected content array');
      const firstContent: unknown = contentArray[0];
      if (!isRecord(firstContent)) throw new Error('Expected content item to be an object');
      if (typeof firstContent.text !== 'string') throw new Error('Expected text to be a string');
      const parsed: unknown = JSON.parse(firstContent.text);
      if (!isRecord(parsed)) throw new Error('Expected parsed result to be an object');
      const runId = parsed.runId;
      if (typeof runId !== 'string') throw new Error('Expected runId to be a string');
      expect(runId).toMatch(/^smoke-test\.\d{8}-\d{6}Z$/);
    } finally {
      await client.close();
    }
  });
});
