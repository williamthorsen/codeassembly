import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listCatalog, readArtifact } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

const MODEL_ALIASES = new Set(['fable', 'haiku', 'inherit', 'opus', 'sonnet']);
const MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/;
const CLAUDE_SUBAGENT_DATA = path.join(CONTENT_ROOT, 'subagents/_data/claude.yaml');

/** One place in the library that declares, or could declare, a model. */
interface ModelDeclaration {
  readonly kind: 'skill' | 'subagent';
  readonly source: string;
  readonly model: unknown;
  /** Set for a skill alone: its `context:` value. */
  readonly context?: unknown;
}

describe('model declarations', () => {
  it('declares only recognized models, and a skill declares one only with `context: fork`', async () => {
    expect(listViolations(await collectDeclarations())).toEqual([]);
  });

  it('reports a skill that declares a model without `context: fork`', () => {
    const violations = listViolations([{ kind: 'skill', source: 'skill a', model: 'sonnet' }]);

    expect(violations).toEqual(['skill a: declares `model` without `context: fork`']);
  });

  it('reports an unrecognized model name', () => {
    const violations = listViolations([
      { kind: 'skill', source: 'skill a', model: 'sonet', context: 'fork' },
      { kind: 'subagent', source: 'subagent b', model: 'gpt-5' },
    ]);

    expect(violations).toEqual([
      'skill a: declares unrecognized model "sonet"',
      'subagent b: declares unrecognized model "gpt-5"',
    ]);
  });

  it('accepts every alias and a full model ID', () => {
    const declarations = [...MODEL_ALIASES, 'claude-opus-5-5'].map((model): ModelDeclaration => ({
      kind: 'subagent',
      source: 'subagent',
      model,
    }));

    expect(listViolations(declarations)).toEqual([]);
  });
});

// region | Helpers

/** Collects the model declarations of every skill, every subagent, and every entry of the Claude subagent data. */
async function collectDeclarations(): Promise<ReadonlyArray<ModelDeclaration>> {
  const { skill, subagent } = await listCatalog(CONTENT_ROOT);
  const declarations: Array<ModelDeclaration> = [];

  for (const slug of skill) {
    const { frontmatter } = await readArtifact(CONTENT_ROOT, 'skill', slug);
    declarations.push({
      kind: 'skill',
      source: `skill ${slug}`,
      model: frontmatter.model,
      context: frontmatter.context,
    });
  }
  for (const slug of subagent) {
    const { frontmatter } = await readArtifact(CONTENT_ROOT, 'subagent', slug);
    declarations.push({ kind: 'subagent', source: `subagent ${slug}`, model: frontmatter.model });
  }

  const overlay: unknown = parse(await readFile(CLAUDE_SUBAGENT_DATA, 'utf8'));
  if (isRecord(overlay)) {
    for (const [key, entry] of Object.entries(overlay)) {
      if (isRecord(entry)) {
        declarations.push({ kind: 'subagent', source: `claude.yaml ${key}`, model: entry.model });
      }
    }
  }

  return declarations;
}

/** Narrows a parsed YAML value to a plain mapping. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lists each declaration that names an unrecognized model, or that puts a model on a skill that does not fork. */
function listViolations(declarations: ReadonlyArray<ModelDeclaration>): ReadonlyArray<string> {
  const violations: Array<string> = [];

  for (const { kind, source, model, context } of declarations) {
    if (model === undefined) {
      continue;
    }
    if (typeof model !== 'string' || !(MODEL_ALIASES.has(model) || MODEL_ID_PATTERN.test(model))) {
      violations.push(`${source}: declares unrecognized model ${JSON.stringify(model)}`);
    }
    if (kind === 'skill' && context !== 'fork') {
      violations.push(`${source}: declares \`model\` without \`context: fork\``);
    }
  }

  return violations;
}

// endregion | Helpers
