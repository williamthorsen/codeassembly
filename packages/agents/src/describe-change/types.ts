import type { ChangeRecord } from '../change-grammar/types.ts';

/** Reports whether `value` names one of the configured surfaces. */
export function isSurface(value: string): value is Surface {
  return SURFACE_NAMES.includes(value);
}

/** What the invocation asks for: titles rendered from a record, or one surface's subject read back into a record. */
export type ParsedArgs =
  { mode: 'parse'; subject: string; surface: Surface } | { mode: 'render'; record: ChangeRecord };

/** A subject read back through a surface's template, or the report that the template did not match it. */
export type ParseOutcome =
  | { matched: false }
  | {
      breaking: boolean;
      matched: true;
      pr_number: string | null;
      scope: string | null;
      ticket_ref: string | null;
      title: string | null;
      type: string | null;
    };

/** The rendered title for each surface, under the `<surface>_title` key the JSON output names. */
export type RenderedTitles = Record<`${Surface}_title`, string>;

/** One surface a title template is configured for. */
export type Surface = (typeof SURFACES)[number];

/** The surfaces a title is configured for, in the order the rendered output names them. */
export const SURFACES = ['commit', 'ticket', 'pr', 'merge'] as const;

// region | Helpers

/** The surface names widened to strings, so a membership test accepts an arbitrary one. */
const SURFACE_NAMES: readonly string[] = SURFACES;

// endregion | Helpers
