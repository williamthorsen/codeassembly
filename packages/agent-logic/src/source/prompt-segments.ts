import type { ConfigDescription, ElementDescription } from '../layout/describe-config.ts';
import type { Span, UnconvertedSpan } from '../schema/agent-logic-schema.ts';
import { findCommentSpans } from './find-comment-spans.ts';

export type Coverage = 'ambient' | 'comment' | 'used' | 'unused' | 'unconverted';

/** A run of prompt text that the same element spans cover. */
export interface PromptSegment {
  start: number;
  end: number;
  text: string;
  coverage: Coverage;
  /** Paths of the elements whose spans cover the segment, narrowest span first. */
  paths: string[];
}

/**
 * Cuts the prompt at every span, comment, and shown-span boundary into contiguous segments, each with the elements
 * that cover it.
 */
export function buildPromptSegments(
  prompt: string,
  description: ConfigDescription,
  unconverted: UnconvertedSpan[],
  shown: Span[] = [],
): PromptSegment[] {
  // The root's span is the whole prompt, so it would mark every segment.
  const elements = [...description.states.filter(({ parentId }) => parentId !== undefined), ...description.transitions];
  const elementSpans = [
    ...[...elements, ...description.ambient].map(({ path, source }) => ({
      path,
      start: source.start,
      end: source.end,
    })),
    // A gated action's passage belongs to the state or transition that takes the action.
    ...elements.flatMap((element) =>
      (element.kind === 'state' ? [...element.entry, ...element.exit] : element.actions)
        .map(({ source }) => source)
        .filter((source) => source !== undefined)
        .map(({ start, end }) => ({ path: element.path, start, end })),
    ),
  ];
  const ambientSpans = description.ambient.map(({ source }) => source);
  const commentSpans = findCommentSpans(prompt);

  const cuts = new Set([0, prompt.length]);
  for (const { start, end } of [...elementSpans, ...unconverted, ...commentSpans, ...shown]) {
    cuts.add(start);
    cuts.add(end);
  }
  const points = [...cuts].toSorted((a, b) => a - b);

  const segments: PromptSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] ?? 0;
    const end = points[index + 1] ?? prompt.length;
    const covering = elementSpans.filter((span) => span.start <= start && span.end >= end);
    // A stable sort keeps the description's order between spans of equal width.
    const paths = covering.toSorted((a, b) => a.end - a.start - (b.end - b.start)).map(({ path }) => path);
    segments.push({
      start,
      end,
      text: prompt.slice(start, end),
      coverage: findCoverage(start, end, { unconverted, ambient: ambientSpans, comments: commentSpans }, paths),
      paths,
    });
  }
  return segments;
}

/** Lists the lowercase words of an element's identifiers and prose, without common function words. */
export function listElementWords(element: ElementDescription): Set<string> {
  // An ambient instruction is its passage, so marking its words would mark every word.
  if (element.kind === 'ambient') return new Set();
  const texts =
    element.kind === 'state'
      ? [element.id, ...[...element.entry, ...element.exit].map(({ text }) => text)]
      : [element.event ?? '', element.guard ?? '', ...element.actions.map(({ text }) => text)];
  return new Set(texts.flatMap(splitWords));
}

/** Splits text into its lowercase words, dropping common function words. */
export function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && !STOP_WORDS.has(word));
}

// region | Helpers
/** Returns a segment's coverage: unconverted before ambient, ambient before used, used before comment. */
function findCoverage(
  start: number,
  end: number,
  { unconverted, ambient, comments }: Record<'ambient' | 'comments' | 'unconverted', Span[]>,
  paths: string[],
): Coverage {
  if (unconverted.some(covers)) return 'unconverted';
  if (ambient.some(covers)) return 'ambient';
  if (paths.length > 0) return 'used';
  return comments.some(covers) ? 'comment' : 'unused';

  function covers(span: Span): boolean {
    return span.start <= start && span.end >= end;
  }
}

// Function words that every passage shares, which would make the bold meaningless.
const STOP_WORDS = new Set(
  'a an and are as at be by do does for from has have i if in into is it its no not of on once or our so that the their them then they this to us was we what when whether which with yes you your'.split(
    ' ',
  ),
);
// endregion | Helpers
