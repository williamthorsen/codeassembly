import { defineConfig } from '@williamthorsen/release-kit/config';

const config = defineConfig({
  releaseNotes: {
    shouldInjectIntoReadme: true,
  },
  repoLabels: {
    extends: ['common'],
    labels: {
      'scope:root': { color: '00ff96' },
      'scope:agents': { color: '00ff96' },
      'scope:factory': { color: '00ff96' },
      'scope:fleet': { color: '00ff96' },
      'scope:foreman': { color: '00ff96' },
      'scope:kb': { color: '00ff96' },
      'scope:lifecycle': { color: '00ff96' },
      'scope:mcp': { color: '00ff96' },
      'scope:run-core': { color: '00ff96' },
    },
  },
  workspaces: [
    { dir: 'agents', legacyIdentities: [{ name: '@codeassembly/agents', tagPrefix: 'agents-v' }] },
    { dir: 'fleet', shouldExclude: true },
    { dir: 'foreman', shouldExclude: true },
    { dir: 'mcp', legacyIdentities: [{ name: '@codeassembly/mcp', tagPrefix: 'mcp-v' }] },
    { dir: 'run-core', legacyIdentities: [{ name: '@codeassembly/run-core', tagPrefix: 'run-core-v' }] },
  ],
});

export default config;
