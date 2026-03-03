import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { isErrorResult, parseAndGetString } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../cli.ts');

describe('stdio transport smoke test', { timeout: 20_000 }, () => {
  it('spawns MCP server subprocess and calls init_run successfully', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx/esm', cliPath],
    });

    const client = new Client({ name: 'smoke-test', version: '0.0.1' });

    try {
      await client.connect(transport);

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
      expect(isErrorResult(result)).toBe(false);

      // Parse and verify runId using shared helpers
      const runId = parseAndGetString(result, 'runId');
      expect(runId).toMatch(/^smoke-test\.\d{8}-\d{6}Z$/);
    } finally {
      await client.close();
    }
  });
});
