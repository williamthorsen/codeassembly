import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { buildElkGraph } from '../build-elk-graph.ts';
import { describeConfig } from '../describe-config.ts';

describe(buildElkGraph, () => {
  it('nests a node per state as the states nest, sizing leaves and leaving compound states to ELK', () => {
    const graph = buildElkGraph(describeConfig(buildMinimalConfig()));
    const [root] = graph.children ?? [];

    expect(root?.id).toBe('agent');
    expect(root?.width).toBeUndefined();
    expect(root?.children?.map(({ id }) => id)).toStrictEqual(['greeting', 'done']);
    expect(root?.children?.every(({ width, height }) => (width ?? 0) > 0 && (height ?? 0) > 0)).toBe(true);
  });

  it('reserves no room inside a compound state for its name, which is drawn above it', () => {
    const config = buildMinimalConfig();
    const shortNamed = buildElkGraph(describeConfig(config)).children?.[0]?.layoutOptions?.['elk.padding'];
    config.id = 'an-agent-whose-name-wraps-across-several-lines-of-a-card';

    const longNamed = buildElkGraph(describeConfig(config)).children?.[0]?.layoutOptions?.['elk.padding'];

    expect(longNamed).toBe(shortNamed);
  });

  it('leaves the graph unchanged by ambient instructions while preambles are hidden', () => {
    const plain = buildElkGraph(describeConfig(buildMinimalConfig()), { showAmbient: true });

    expect(buildElkGraph(describeConfig(buildAmbientConfig()), { showAmbient: false })).toStrictEqual(plain);
  });

  it("reserves a shown preamble's height above a flow's children", () => {
    const description = describeConfig(buildAmbientConfig());
    const hidden = buildElkGraph(description, { showAmbient: false }).children?.[0]?.layoutOptions ?? {};
    const shown = buildElkGraph(description, { showAmbient: true }).children?.[0]?.layoutOptions ?? {};

    expect(readPadding(shown['elk.padding'], 'top')).toBeGreaterThan(readPadding(hidden['elk.padding'], 'top'));
  });

  it("lowers a flow's top padding when its preamble may take more columns", () => {
    const config = buildAmbientConfig();
    config.meta.ambient = [...(config.meta.ambient ?? []), { start: 16, end: 38 }];
    const description = describeConfig(config);
    const readTop = (limit: number): number =>
      readPadding(
        buildElkGraph(description, { showAmbient: true, preambleColumnLimits: new Map([['agent', limit]]) })
          .children?.[0]?.layoutOptions?.['elk.padding'],
        'top',
      );

    expect(readTop(2)).toBeLessThan(readTop(1));
  });

  it("adds a flow's extra width to its right padding", () => {
    const description = describeConfig(buildAmbientConfig());
    const options = buildElkGraph(description, { showAmbient: true, extraWidths: new Map([['agent', 100]]) })
      .children?.[0]?.layoutOptions;

    expect(readPadding(options?.['elk.padding'], 'right')).toBe(120);
  });

  it('adds one labelled edge per transition, keyed by its path', () => {
    const graph = buildElkGraph(describeConfig(buildMinimalConfig()));

    expect(graph.edges).toStrictEqual([
      expect.objectContaining({
        id: 'states.greeting.on["user.replied"]',
        sources: ['greeting'],
        targets: ['done'],
        labels: [expect.objectContaining({ text: 'user.replied' })],
      }),
    ]);
  });

  it('gives a label with more lines more height', () => {
    const config = buildMinimalConfig();
    const plain = buildElkGraph(describeConfig(config)).edges?.[0]?.labels?.[0]?.height ?? 0;
    const transition = config.states['greeting']?.on?.['user.replied'];
    if (transition === undefined || Array.isArray(transition)) throw new Error('fixture changed shape');
    transition.guard = { type: 'nl', params: { text: 'the reply is a yes' } };

    const guarded = buildElkGraph(describeConfig(config)).edges?.[0]?.labels?.[0]?.height ?? 0;

    expect(guarded).toBeGreaterThan(plain);
  });

  it('gives a state whose name wraps in the title face more height', () => {
    const config = buildMinimalConfig();
    const short = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;
    const done = config.states['done'];
    if (done === undefined) throw new Error('The fixture lacks its final state.');
    done.meta.name = 'Explain that downloads cannot be refunded';

    const long = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;

    expect(long).toBeGreaterThan(short);
  });

  it("narrows a state's title by its glyphs, so that an id which fits beside none wraps beside one", () => {
    const config = buildMinimalConfig();
    const done = config.states['done'];
    if (done === undefined) throw new Error('The fixture lacks its final state.');
    done.id = 'confirm_the_refunded_amount';
    const withGlyph = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;
    delete done.type;

    const withoutGlyph = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;

    expect(withGlyph).toBeGreaterThan(withoutGlyph);
  });

  it('sizes a card for its first actions, each clamped, and a line counting the rest', () => {
    const longAction =
      'resolve the artifact path from the ticket, the project slug, and the artifact base directory, then create it';
    const heightWith = (count: number): number => {
      const config = buildMinimalConfig();
      const greeting = config.states['greeting'];
      if (greeting === undefined) throw new Error('The fixture lacks its waiting state.');
      greeting.entry = Array.from({ length: count }, (_, index) => ({
        type: 'nl',
        params: { text: `${index} ${longAction}` },
      }));
      return buildElkGraph(describeConfig(config)).children?.[0]?.children?.[0]?.height ?? 0;
    };

    expect(heightWith(3) - heightWith(2)).toBe(18);
    expect(heightWith(7)).toBe(heightWith(3));
  });

  it('gives an inferred state a line for the word "inferred"', () => {
    const config = buildMinimalConfig();
    const stated = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;
    const done = config.states['done'];
    if (done === undefined) throw new Error('The fixture lacks its final state.');
    done.meta.inferred = true;

    const inferred = buildElkGraph(describeConfig(config)).children?.[0]?.children?.[1]?.height ?? 0;

    expect(inferred).toBeGreaterThan(stated);
  });
});

// region | Helpers
/** Builds the minimal config with one ambient instruction at the root. */
function buildAmbientConfig(): ReturnType<typeof buildMinimalConfig> {
  const config = buildMinimalConfig();
  config.meta.ambient = [{ start: 0, end: 14 }];
  return config;
}

/** Reads one side from an ELK padding option such as `[top=40,left=28,bottom=20,right=20]`. */
function readPadding(padding: string | undefined, side: string): number {
  return Number(new RegExp(String.raw`${side}=(\d+)`).exec(padding ?? '')?.[1] ?? '');
}
// endregion | Helpers
