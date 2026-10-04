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
      'scope:guidance': { color: '00ff96' },
      'scope:kb': { color: '00ff96' },
      'scope:mcp': { color: '00ff96', archived: true },
      'scope:run-core': { color: '00ff96' },
    },
  },
  workspaces: [
    { dir: 'agents', legacyIdentities: [{ name: '@codeassembly/agents', tagPrefix: 'agents-v' }] },
    { dir: 'guidance' },
    { dir: 'run-core', legacyIdentities: [{ name: '@codeassembly/run-core', tagPrefix: 'run-core-v' }] },
  ],
  retiredPackages: [
    { name: '@codeassembly/mcp', tagPrefix: 'mcp-v' },
    { name: 'codeassembly-lifecycle', tagPrefix: 'codeassembly-lifecycle-v' },
    { name: 'codeassembly-mcp', tagPrefix: 'codeassembly-mcp-v' },
  ],
});

export default config;
