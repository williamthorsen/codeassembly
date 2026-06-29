import { statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { unindent } from '@williamthorsen/toolbelt.strings/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeArtifactMarker } from '../artifact-marker.ts';
import { expandIncludes } from '../directive-expander.ts';
import { deploySubagent, resolveDeclaredSubagent, type SubagentDeployContext } from '../subagent-deploy.ts';
import { renderSubagentForHarness } from '../subagent-transform.ts';
import { loadToolMapping } from '../tool-name-rewriter.ts';

const CLAUDE_OVERLAY = unindent`
  _tools:
    Read: Read

  _defaults:
    permissionMode: bypassPermissions

`;

describe(deploySubagent, () => {
  let contentDir: string;
  let librarySubagentsDir: string;
  let destParent: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    contentDir = path.join(tmpdir(), `agents-test-sub-deploy-lib-${stamp}`);
    librarySubagentsDir = path.join(contentDir, 'subagents');
    destParent = path.join(tmpdir(), `agents-test-sub-deploy-dest-${stamp}`);
    await mkdir(librarySubagentsDir, { recursive: true });
    await mkdir(destParent, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
    await rm(destParent, { recursive: true, force: true });
  });

  /** Writes a library subagent `<slug>.md` from raw content. */
  async function writeLibrarySubagent(slug: string, content: string): Promise<void> {
    await writeFile(path.join(librarySubagentsDir, `${slug}.md`), content, 'utf8');
  }

  function claudeContext(): SubagentDeployContext {
    return {
      contentDir,
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    };
  }

  /** Renders the bytes `deploySubagent` should write for `canary` by mirroring its expand → render → mark composition. */
  async function renderExpectedDeploy(srcPath: string): Promise<string> {
    const expanded = await expandIncludes(srcPath, contentDir);
    const rendered = renderSubagentForHarness(expanded, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'canary.md',
      sourceLabel: 'subagents/canary.md',
      pathPrefix: '.claude',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    });
    return makeArtifactMarker('subagent').injectMarker(rendered, 'canary');
  }

  const SOURCE = unindent`
    ---
    name: canary
    description: Deployment canary
    ---

    # Canary

    Use {tool:Read}; run \`{harness_home_dir}/scripts/x.sh\`.

  `;

  it('writes the transformed body with the ownership marker but no provenance marker', async () => {
    await writeLibrarySubagent('canary', SOURCE);
    const destPath = path.join(destParent, 'canary.md');

    await deploySubagent(
      { slug: 'canary', srcPath: path.join(librarySubagentsDir, 'canary.md') },
      destPath,
      claudeContext(),
    );

    const deployed = await readFile(destPath, 'utf8');
    expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
    expect(deployed).toContain('permissionMode: bypassPermissions');
    expect(deployed).toContain('Use Read;');
    expect(deployed).toContain('~/.claude/scripts/x.sh');
    expect(deployed).not.toContain('GENERATED FILE');
  });

  it('re-deploys unchanged content as the same bytes without rewriting the file', async () => {
    await writeLibrarySubagent('canary', SOURCE);
    const destPath = path.join(destParent, 'canary.md');
    const resolved = { slug: 'canary', srcPath: path.join(librarySubagentsDir, 'canary.md') };
    const expected = await renderExpectedDeploy(resolved.srcPath);
    await deploySubagent(resolved, destPath, claudeContext());
    expect(await readFile(destPath, 'utf8')).toBe(expected);
    const firstMtime = statSync(destPath).mtimeMs;

    await deploySubagent(resolved, destPath, claudeContext());

    expect(await readFile(destPath, 'utf8')).toBe(expected);
    expect(statSync(destPath).mtimeMs).toBe(firstMtime);
  });
});

describe(resolveDeclaredSubagent, () => {
  let contentDir: string;
  let librarySubagentsDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-sub-lib-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    librarySubagentsDir = path.join(contentDir, 'subagents');
    await mkdir(librarySubagentsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  /** Writes a library subagent `<slug>.md`. */
  async function writeLibrarySubagent(slug: string): Promise<void> {
    await writeFile(
      path.join(librarySubagentsDir, `${slug}.md`),
      `---\nname: ${slug}\n---\n\n# ${slug}\n\nBody.\n`,
      'utf8',
    );
  }

  it('resolves a declared subagent to its slug and source file', async () => {
    await writeLibrarySubagent('canary');

    const resolved = await resolveDeclaredSubagent('canary', librarySubagentsDir);

    expect(resolved.slug).toBe('canary');
    expect(resolved.srcPath).toBe(path.join(librarySubagentsDir, 'canary.md'));
  });

  it('throws a clear error naming the slug when the subagent is missing from the library', async () => {
    await expect(resolveDeclaredSubagent('ghost', librarySubagentsDir)).rejects.toThrow(/ghost/);
  });
});
