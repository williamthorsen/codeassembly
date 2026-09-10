import { compileTemplate, type GroupNode, type TemplateNode } from './compile-template.ts';
import { parse } from './parse.ts';
import { render } from './render.ts';
import type { TokenName } from './tokens.ts';
import type { ChangeRecord, Taxonomy } from './types.ts';

/**
 * Reports every reason a template cannot round-trip, empty where it can. A caller refuses the template on a non-empty
 * result; each message names the template and the defect, so the refusal says what to change.
 *
 * The structural rules run first and hold whatever the values are. A render-and-parse pass over well-formed values then
 * backstops them, so a later grammar extension cannot outrun the checker silently.
 *
 * Value-dependent ambiguity is not a defect. Under `[{ticket_ref} ]{title}` a title opening with `#466 ` is
 * indistinguishable from a ticket reference, as it is for release-kit, and the template is accepted.
 */
export function verify(template: string, taxonomy: Taxonomy): string[] {
  let nodes: TemplateNode[];
  try {
    nodes = compileTemplate(template);
  } catch (error) {
    return [error instanceof Error ? error.message : `Template ${JSON.stringify(template)} could not be compiled.`];
  }

  const flattened = flattenTemplate(nodes);
  const defects = [
    ...findAdjacentTokenDefects(template, flattened),
    ...findRepeatedTokenDefects(template, flattened),
    ...findGroupBoundaryDefects(template, nodes),
    ...findBreakingMarkerDefects(template, flattened),
  ];
  return defects.length > 0 ? defects : findRoundTripDefects(template, nodes, flattened, taxonomy);
}

// region | Helpers

/** Reports whether a neighbouring node could itself supply the `!` at the edge that faces `{breaking}`. */
function admitsMarker(node: FlatNode | undefined, edge: 'end' | 'start'): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.kind === 'literal') {
    return (edge === 'end' ? node.text.at(-1) : node.text.at(0)) === '!';
  }
  return FREE_TEXT_TOKENS.has(node.name);
}

/** Serializes a record with its keys ordered, so two equal records compare equal as text. */
function describeRecord(record: ChangeRecord | undefined): string {
  if (record === undefined) {
    return 'unmatched';
  }
  return JSON.stringify(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}

/** Reports two tokens with no literal between them, which a parse cannot split. `{breaking}` has its own rule. */
function findAdjacentTokenDefects(template: string, flattened: readonly FlatNode[]): string[] {
  const defects: string[] = [];
  for (const [index, node] of flattened.entries()) {
    const next = flattened[index + 1];
    if (node.kind !== 'token' || next?.kind !== 'token' || node.name === 'breaking' || next.name === 'breaking') {
      continue;
    }
    defects.push(
      `Template ${JSON.stringify(template)} places {${node.name}} and {${next.name}} with no literal between them.`,
    );
  }
  return defects;
}

/**
 * Reports `{breaking}` placed where the marker cannot be told from its neighbours: beside free text that may itself
 * carry a `!`, or beside a literal that spells one.
 */
function findBreakingMarkerDefects(template: string, flattened: readonly FlatNode[]): string[] {
  const defects: string[] = [];
  for (const [index, node] of flattened.entries()) {
    if (node.kind !== 'token' || node.name !== 'breaking') {
      continue;
    }
    if (admitsMarker(flattened[index - 1], 'end') || admitsMarker(flattened[index + 1], 'start')) {
      defects.push(
        `Template ${JSON.stringify(template)} places {${node.name}} where "!" is not distinguishable from its neighbour.`,
      );
    }
  }
  return defects;
}

/** Reports an optional group whose opening literal repeats the text before it, hiding where the group begins. */
function findGroupBoundaryDefects(template: string, nodes: readonly TemplateNode[]): string[] {
  const defects: string[] = [];
  let previousLiteral: string | undefined;

  function walk(list: readonly TemplateNode[]): void {
    for (const node of list) {
      if (node.kind === 'literal') {
        previousLiteral = node.text;
        continue;
      }
      if (node.kind === 'token') {
        previousLiteral = undefined;
        continue;
      }
      const leading = readLeadingLiteral(node);
      if (previousLiteral !== undefined && leading !== undefined && previousLiteral.at(-1) === leading.at(0)) {
        defects.push(
          `Template ${JSON.stringify(template)} opens an optional group with ${JSON.stringify(leading)}, repeating the text before it.`,
        );
      }
      walk(node.children);
    }
  }

  walk(nodes);
  return defects;
}

/** Reports a token named more than once, which leaves a parse no way to decide which occurrence a value belongs to. */
function findRepeatedTokenDefects(template: string, flattened: readonly FlatNode[]): string[] {
  const counts = new Map<TokenName, number>();
  for (const node of flattened) {
    if (node.kind === 'token') {
      counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([name]) => `Template ${JSON.stringify(template)} names {${name}} more than once.`);
}

/** Renders well-formed values and reads them back, so a defect no structural rule names still surfaces. */
function findRoundTripDefects(
  template: string,
  nodes: readonly TemplateNode[],
  flattened: readonly FlatNode[],
  taxonomy: Taxonomy,
): string[] {
  const named = new Set(flattened.filter((node) => node.kind === 'token').map((node) => node.name));
  const carriesMarker = named.has('breaking') || named.has('type');
  const defects: string[] = [];

  const markerStates = carriesMarker ? [false, true] : [false];
  for (const breaking of markerStates) {
    const sample: ChangeRecord = {};
    if (breaking) {
      sample.breaking = true;
    }
    if (named.has('pr_number')) {
      sample.prNumber = SAMPLE_PR_NUMBER;
    }
    if (named.has('scope')) {
      sample.scope = SAMPLE_SCOPE;
    }
    if (named.has('ticket_ref')) {
      sample.ticketRef = SAMPLE_TICKET_REF;
    }
    if (named.has('title')) {
      sample.title = SAMPLE_TITLE;
    }
    const type = taxonomy.types[0]?.key;
    if (named.has('type') && type !== undefined) {
      sample.type = type;
    }

    const rendered = render(nodes, sample);
    const parsed = parse(nodes, rendered, taxonomy);
    if (describeRecord(parsed) !== describeRecord(sample)) {
      defects.push(
        `Template ${JSON.stringify(template)} does not round-trip: it renders ${describeRecord(sample)} as ${JSON.stringify(rendered)}, which reads back as ${describeRecord(parsed)}.`,
      );
    }
  }
  return defects;
}

/** A template node with the groups flattened away. */
type FlatNode = Exclude<TemplateNode, GroupNode>;

/** Flattens the tree to document order, a group's children standing in for the group. */
function flattenTemplate(nodes: readonly TemplateNode[]): FlatNode[] {
  const flattened: FlatNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'group') {
      flattened.push(...flattenTemplate(node.children));
    } else {
      flattened.push(node);
    }
  }
  return flattened;
}

/** The tokens whose values are free text, so either edge of one may spell the breaking marker. */
const FREE_TEXT_TOKENS: ReadonlySet<TokenName> = new Set<TokenName>(['scope', 'title']);

/** The group's own opening literal, where it opens with one. */
function readLeadingLiteral(group: GroupNode): string | undefined {
  const first = group.children.at(0);
  if (first?.kind === 'literal') {
    return first.text;
  }
  return first?.kind === 'group' ? readLeadingLiteral(first) : undefined;
}

const SAMPLE_PR_NUMBER = '470';
const SAMPLE_SCOPE = 'agents';
const SAMPLE_TICKET_REF = '#466';
const SAMPLE_TITLE = 'Add foo';

// endregion | Helpers
