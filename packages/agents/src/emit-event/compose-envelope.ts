import type { EmitContext, EventEnvelope } from './types.ts';

/**
 * Composes the envelope from the agent-supplied `type` and `payload` plus the resolved context. Every context field is
 * optional in the output: an unresolvable one is dropped rather than filled with the placeholder that stands in for it
 * in the file path, so a consumer can always tell an unresolved field from a resolved one that happens to look like a
 * placeholder.
 *
 * Key order is the envelope's documented v0 field order, which JSON serialization preserves; a reader scanning raw
 * JSONL lines sees the same shape on every line.
 */
export function composeEnvelope(input: {
  id: string;
  now: Date;
  /** One of `EVENT_TYPES` by convention; an undeclared type is composed rather than refused. */
  type: string;
  context: EmitContext;
  payload: Record<string, unknown>;
}): EventEnvelope {
  const { context } = input;
  return {
    id: input.id,
    ts: input.now.toISOString(),
    type: input.type,
    ...(context.repo !== undefined && { repo: context.repo }),
    ...(context.branch !== undefined && { branch: context.branch }),
    ...(context.session !== undefined && { session: context.session }),
    cwd: context.cwd,
    ...(context.harness !== undefined && { harness: context.harness }),
    payload: input.payload,
  };
}
