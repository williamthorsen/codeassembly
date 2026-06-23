import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HarnessId } from '../../lib/types.ts';

/**
 * Overrides for {@link buildContentTree}. Each field is shallow-merged over the default tree by its top-level key
 * (skill name, file name, or harness id), so a test customizes only what it asserts on and inherits the rest.
 */
export interface ContentTreeOptions {
  /** Top-level shared skills, keyed by skill name then file name. Replaces a default skill of the same name. */
  readonly skills?: Record<string, Record<string, string>>;
  /** Harness-specific skills under `skills/_harnesses/<harness>/`, keyed by harness, skill name, then file name. */
  readonly harnessSkills?: Partial<Record<HarnessId, Record<string, Record<string, string>>>>;
  /** Support files under `skills/_data/`, keyed by file name. */
  readonly dataFiles?: Record<string, string>;
  /** Subagent `.md` files under `subagents/`, keyed by file name. */
  readonly subagents?: Record<string, string>;
  /** Overlay YAML written to `subagents/_data/<frontmatterFile>`, keyed by harness. */
  readonly overlays?: Partial<Record<HarnessId, string>>;
  /** Script files under `scripts/`, keyed by file name. */
  readonly scripts?: Record<string, string>;
  /** Shared guidance files under `guidance/shared/`, keyed by file name. */
  readonly sharedGuidance?: Record<string, string>;
  /** Harness guidance files under `guidance/_harnesses/<harness>/`, keyed by harness then file name. */
  readonly harnessGuidance?: Partial<Record<HarnessId, Record<string, string>>>;
}

/**
 * Writes a minimal but realistic CodeAssembly content tree into `contentDir` for use as the third argument to
 * `installCommand`, so install-command tests exercise the full pipeline against a small fixture. The default tree
 * carries every shape the integration tests rely on: a relative-link skill, an opt-out skill (`user-invocable: false`),
 * a `_data` support file, one claude-only and one rovodev-only harness skill, a subagent with overlay-merged
 * frontmatter and a `{harness_home_dir}` script token, a script, shared guidance, and per-harness guidance that
 * inlines the shared file via include directives. Provided options shallow-merge over the defaults by top-level key.
 */
export async function buildContentTree(contentDir: string, options: ContentTreeOptions = {}): Promise<string> {
  const skills = { ...DEFAULT_SKILLS, ...options.skills };
  const dataFiles = { ...DEFAULT_DATA_FILES, ...options.dataFiles };
  const subagents = { ...DEFAULT_SUBAGENTS, ...options.subagents };
  const scripts = { ...DEFAULT_SCRIPTS, ...options.scripts };
  const sharedGuidance = { ...DEFAULT_SHARED_GUIDANCE, ...options.sharedGuidance };

  await writeSkillTree(path.join(contentDir, 'skills'), skills);
  await writeFileMap(path.join(contentDir, 'skills', '_data'), dataFiles);

  for (const harness of HARNESS_IDS) {
    const harnessSkills = options.harnessSkills?.[harness] ?? DEFAULT_HARNESS_SKILLS[harness];
    await writeSkillTree(path.join(contentDir, 'skills', '_harnesses', harness), harnessSkills);
  }

  // Overlays are read by `readOverlay` under their frontmatter-file name (`claude.yaml`, `rovodev.yaml`).
  const overlayFiles: Record<string, string> = {};
  for (const harness of HARNESS_IDS) {
    overlayFiles[`${harness}.yaml`] = options.overlays?.[harness] ?? DEFAULT_OVERLAYS[harness];
  }

  await writeFileMap(path.join(contentDir, 'subagents'), subagents);
  await writeFileMap(path.join(contentDir, 'subagents', '_data'), overlayFiles);
  await writeFileMap(path.join(contentDir, 'scripts'), scripts);
  await writeFileMap(path.join(contentDir, 'guidance', 'shared'), sharedGuidance);

  for (const harness of HARNESS_IDS) {
    const guidance = options.harnessGuidance?.[harness] ?? DEFAULT_HARNESS_GUIDANCE[harness];
    await writeFileMap(path.join(contentDir, 'guidance', '_harnesses', harness), guidance);
  }

  return contentDir;
}

const HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude', 'rovodev'];

const DEFAULT_SKILLS: Record<string, Record<string, string>> = {
  // `alpha` is user-invocable (default) and carries a relative `../_data/` link, so the install exercises path
  // rewriting and `alpha` appears in the generated Rovo Dev prompts.yml.
  alpha: {
    'SKILL.md': [
      '---',
      'name: alpha',
      'description: Alpha fixture skill',
      'user-invocable: true',
      '---',
      '',
      '# Alpha',
      '',
      'See [sample](../_data/sample.md).',
      '',
    ].join('\n'),
  },
  // `beta` opts out of discovery, so it is excluded from prompts.yml.
  beta: {
    'SKILL.md': [
      '---',
      'name: beta',
      'description: Beta fixture skill',
      'user-invocable: false',
      '---',
      '',
      '# Beta',
      '',
    ].join('\n'),
  },
};

const DEFAULT_HARNESS_SKILLS: Record<HarnessId, Record<string, Record<string, string>>> = {
  claude: {
    'claude-only': {
      'SKILL.md': [
        '---',
        'name: claude-only',
        'description: Claude-only fixture skill',
        '---',
        '',
        '# Claude only',
        '',
      ].join('\n'),
    },
  },
  rovodev: {
    'rovodev-only': {
      'SKILL.md': [
        '---',
        'name: rovodev-only',
        'description: Rovodev-only fixture skill',
        '---',
        '',
        '# Rovodev only',
        '',
      ].join('\n'),
    },
  },
};

const DEFAULT_DATA_FILES: Record<string, string> = {
  'sample.md': '# Sample support file\n',
};

const DEFAULT_SUBAGENTS: Record<string, string> = {
  // Carries frontmatter (so the overlay merge applies) and a `{harness_home_dir}` token (so template expansion runs).
  'demo-agent.md': [
    '---',
    'name: demo-agent',
    'description: Demo fixture subagent',
    '---',
    '',
    '# Demo agent',
    '',
    'Run `{harness_home_dir}/scripts/demo.sh` to do the thing.',
    '',
  ].join('\n'),
};

const DEFAULT_OVERLAYS: Record<HarnessId, string> = {
  claude: [
    '_tools:',
    '  Bash: Bash',
    '  Read: Read',
    '  Write: Write',
    '',
    '_defaults:',
    '  permissionMode: bypassPermissions',
    '',
    'demo-agent:',
    '  model: inherit',
    '  memory: user',
    '',
  ].join('\n'),
  rovodev: ['_tools:', '  Bash: bash', '  Read: open_files', '  Write: create_file', '', '_defaults: {}', ''].join(
    '\n',
  ),
};

const DEFAULT_SCRIPTS: Record<string, string> = {
  'demo.sh': '#!/usr/bin/env bash\necho demo\n',
};

const DEFAULT_SHARED_GUIDANCE: Record<string, string> = {
  'AGENTS.md': '# Fixture shared guidance\n\nShared body.\n',
};

const DEFAULT_HARNESS_GUIDANCE: Record<HarnessId, Record<string, string>> = {
  claude: {
    'CLAUDE.md': ['Fixture claude preamble.', '', '<!-- include: ../../shared/AGENTS.md / -->', ''].join('\n'),
  },
  rovodev: {
    'AGENTS.md': [
      '<!-- include: ../../shared/AGENTS.md / -->',
      '<!-- include: ./codeassembly-guidance.md / -->',
      '',
    ].join('\n'),
    'codeassembly-guidance.md': '## Fixture interaction\n\nRovodev-specific body.\n',
  },
};

/** Writes a flat map of file name to content into `dir`, creating `dir` if needed. */
async function writeFileMap(dir: string, files: Record<string, string>): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }
}

/** Writes a map of skill name to its file map under `skillsRoot`, each skill in its own directory. */
async function writeSkillTree(skillsRoot: string, skills: Record<string, Record<string, string>>): Promise<void> {
  for (const [skillName, files] of Object.entries(skills)) {
    const skillDir = path.join(skillsRoot, skillName);
    await mkdir(skillDir, { recursive: true });
    for (const [fileName, body] of Object.entries(files)) {
      const fullPath = path.join(skillDir, fileName);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, body, 'utf8');
    }
  }
}
