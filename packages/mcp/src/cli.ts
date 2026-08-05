import process from 'node:process';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.ts';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', async () => {
  try {
    await server.close();
  } catch (error: unknown) {
    console.error('[mcp] failed to close server:', error);
  }
});
