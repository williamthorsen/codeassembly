import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import { expandIncludes } from '../../lib/directive-expander.ts';
import { HARNESSES } from '../../lib/harness.ts';
import { loadHarnessOverlay } from '../../lib/harness-overlay.ts';
import type { RulebookInvocationCatalog } from '../../lib/invocation-tokens.ts';
import { homeAnchor } from '../../lib/path-rewriter.ts';
import { renderSubagentForHarness } from '../../lib/subagent-transform.ts';

/** The rulebook `orchestrated-coder` injects; no source under test addresses another. */
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['commit-conventions', { skillName: 'consult-commit-conventions', skill: true }],
]);

/**
 * Round-trip tests verifying the reviewer and coder subagents render against the real `content/` tree with their
 * shared partials fully inlined: no leftover include directives, and the key prose blocks present. They reproduce
 * `sync`'s subagent-deploy transform (expand includes, then `renderSubagentForHarness`), so they assert the exact
 * body `sync` writes — install no longer deploys subagents.
 */
describe('reviewer and coder partials render correctly', () => {
  const contentDir = resolveContentDir();
  const harnessConfig = HARNESSES.claude;
  let overlayYaml: string;

  beforeAll(async () => {
    overlayYaml = await loadHarnessOverlay(contentDir, harnessConfig);
  });

  /** Renders a subagent's deployed claude body exactly as `sync`'s `deploySubagent` does: expand includes, then merge frontmatter and rewrite tool, path, and template placeholders. */
  async function readDeployed(name: string): Promise<string> {
    const fileName = `${name}.md`;
    const expanded = await expandIncludes(path.join(contentDir, 'subagents', fileName), contentDir);
    return renderSubagentForHarness(expanded, {
      overlayYaml,
      fileRelPath: fileName,
      sourceLabel: `subagents/${fileName}`,
      anchor: homeAnchor(harnessConfig.homeDir),
      guidanceFileName: harnessConfig.guidanceFileName,
      homeDir: harnessConfig.homeDir,
      harnessId: harnessConfig.id,
      skillSigil: harnessConfig.skillSigil,
      subagentSigil: harnessConfig.subagentSigil,
      rulebooks: RULEBOOKS,
    });
  }

  const returnBlockReviewers = [
    'aspect-code-reviewer',
    'aspect-silent-failure-reviewer',
    'aspect-test-reviewer',
    'orchestrated-reviewer',
  ] as const;

  for (const reviewer of returnBlockReviewers) {
    it(`expands all partials in ${reviewer} (no leftover directives)`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('<!-- /include -->');
      expect(content).not.toContain('<!-- children -->');
    });

    it(`${reviewer} preserves the HARD-GATE block including the re-review note`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).toContain('your NEXT tool use MUST be a `Write` of the review scaffold');
      expect(content).toContain('The HARD-GATE applies on every dispatch, including re-reviews');
    });

    it(`${reviewer} preserves the scaffold subsection`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).toContain('### Scaffold (first write)');
      expect(content).toContain('### Criticality: (pending)');
      expect(content).toContain('(none yet)');
    });

    it(`${reviewer} preserves the interim writes prose and reviewer-specific example`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).toContain('### Interim writes (after each finding)');
      expect(content).toContain('Example interim form with one finding present');
    });

    it(`${reviewer} preserves the finalize subsection and the "Then emit" sentence`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).toContain('### Finalize (reserved last 3 turns)');
      expect(content).toContain('Then emit your structured return block.');
    });
  }

  it('expands all partials in code-simplification-reviewer', async () => {
    const content = await readDeployed('code-simplification-reviewer');
    expect(content).not.toContain('<!-- include:');
    expect(content).not.toContain('<!-- /include -->');
    expect(content).not.toContain('<!-- children -->');
  });

  it('code-simplification-reviewer omits the re-review note (intentional carve-out)', async () => {
    const content = await readDeployed('code-simplification-reviewer');
    expect(content).toContain('your NEXT tool use MUST be a `Write` of the review scaffold');
    expect(content).not.toContain('The HARD-GATE applies on every dispatch, including re-reviews');
  });

  it('code-simplification-reviewer keeps the "for this phase" prelude addendum', async () => {
    const content = await readDeployed('code-simplification-reviewer');
    expect(content).toContain('primary state-transfer channel for this phase');
    expect(content).toContain('decide whether to dispatch a coder fix cycle');
  });

  it('code-simplification-reviewer omits the "Then emit" sentence (intentional carve-out)', async () => {
    const content = await readDeployed('code-simplification-reviewer');
    expect(content).toContain('### Finalize (reserved last 3 turns)');
    expect(content).not.toContain('Then emit your structured return block.');
  });

  it('orchestrated-coder expands all four coder partials', async () => {
    const content = await readDeployed('orchestrated-coder');
    expect(content).not.toContain('<!-- include:');
    expect(content).not.toContain('<!-- /include -->');
    expect(content).not.toContain('<!-- children -->');
    // Key landmarks from each of the four coder partials
    expect(content).toContain('Single-task implementation plans are exempt');
    expect(content).toContain("The change-summary is the orchestrator's primary state-transfer channel");
    expect(content).toContain('### Implementation-mode scaffold');
    expect(content).toContain('### Review-response-mode scaffold');
  });

  const allReviewers = [...returnBlockReviewers, 'code-simplification-reviewer'] as const;

  for (const reviewer of allReviewers) {
    it(`${reviewer} includes the actionability-gate findings bullet`, async () => {
      const content = await readDeployed(reviewer);
      expect(content).toContain('**No self-disqualifying findings**');
    });
  }
});
