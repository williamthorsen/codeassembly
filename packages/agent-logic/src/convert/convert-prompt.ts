import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import type { core } from 'zod';

import type { AgentLogicConfig } from '../schema/agent-logic-schema.ts';
import { formatPath, type Problem, validateConfig } from '../schema/validate-config.ts';
import { draftSchema, type OutOfScope, outOfScopeSchema } from './draft-schema.ts';
import { normalizeConfig } from './normalize-config.ts';
import { resolveQuotes } from './resolve-quotes.ts';

export type ConvertResult =
  | { ok: true; config: AgentLogicConfig; text: string }
  | { ok: false; problems: Problem[] }
  | { ok: false; outOfScope: OutOfScope };

/**
 * Turns the text of a draft into a normalized, valid config whose root id derives from the prompt file's name, returns
 * the draft's out-of-scope verdict, or reports every problem that prevents either.
 */
export function convertPrompt(prompt: string, draftText: string, promptFileName: string): ConvertResult {
  let value: unknown;
  try {
    value = JSON.parse(draftText);
  } catch (error) {
    const reason = describeError(error);
    return { ok: false, problems: [{ path: '', message: `The draft is not valid JSON: ${reason}. Correct it.` }] };
  }

  // Parse a verdict against its own schema, so that a logic draft's issues are not reported as a union failure.
  if (typeof value === 'object' && value !== null && 'outOfScope' in value) {
    const verdict = outOfScopeSchema.safeParse(value);
    return verdict.success
      ? { ok: false, outOfScope: verdict.data.outOfScope }
      : { ok: false, problems: verdict.error.issues.flatMap((issue) => describeDraftIssue(issue, [])) };
  }

  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.flatMap((issue) => describeDraftIssue(issue, [])),
    };
  }

  const resolved = resolveQuotes(parsed.data, prompt, deriveRootId(promptFileName));
  if (!resolved.ok) return resolved;

  // Check before normalizing, whose renamed keys would point the problems at paths that the draft does not contain.
  const checked = validateConfig(resolved.config);
  if (!checked.ok) return checked;

  const validated = validateConfig(normalizeConfig(checked.config));
  if (!validated.ok) return validated;

  return { ok: true, config: validated.config, text: `${JSON.stringify(validated.config, undefined, 2)}\n` };
}

/** Derives the root id from a prompt file's base name: its words in lowercase ASCII, joined by `_`. */
export function deriveRootId(promptFileName: string): string {
  const baseName = path.basename(promptFileName, path.extname(promptFileName));
  const words = baseName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const id = words.join('_');
  if (id === '') return 'agent';
  return /^[0-9]/.test(id) ? `a_${id}` : id;
}

// region | Helpers
/**
 * Describes a draft-schema issue. For a member that takes one transition or a list, zod reports only that the union
 * failed; the alternative whose issues lie deepest is the one that the draft meant, so its issues are reported instead.
 */
function describeDraftIssue(issue: core.$ZodIssue, parentPath: PropertyKey[]): Problem[] {
  const path = [...parentPath, ...issue.path];
  if (issue.code === 'invalid_union') {
    const deepest = issue.errors.toSorted((a, b) => maxPathLength(b) - maxPathLength(a))[0];
    if (deepest !== undefined && maxPathLength(deepest) > 0) {
      return deepest.flatMap((nested) => describeDraftIssue(nested, path));
    }
  }
  return [{ path: formatPath(path), message: `${issue.message}.` }];
}

function maxPathLength(issues: core.$ZodIssue[]): number {
  return Math.max(0, ...issues.map((issue) => issue.path.length));
}
// endregion | Helpers
