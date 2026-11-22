// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  composite,
  measureContrast,
  readDeclarations,
  resolveColour,
} from '../test-utils/resolve-stylesheet-colour.ts';

const STYLESHEET = readFileSync(path.join(import.meta.dirname, '../styles.css'), 'utf8');

/** The start of the private block's selector, as the formatter wraps it. */
const PRIVATE_BLOCK_START = ':where(\n  .statechart-canvas,';

const SEEDS = ['accent', 'global', 'surface', 'text', 'waiting', 'warning'];

/** The seeds' values in the theme that williamthorsen/codeassembly-studio#50 chose. */
const DEFAULT_SEEDS = {
  accent: '#2346c4',
  global: '#b0307f',
  surface: '#ffffff',
  text: '#1c1f24',
  waiting: '#0e9f3c',
  warning: '#c9520a',
};

/** The surfaces on which the canvas sets its colours, as the expressions that resolve them. */
const SURFACES = {
  compound: 'var(--_agent-logic-compound-background)',
  ground: 'var(--xy-background-color-default)',
  hover: 'var(--_agent-logic-hover-background)',
  node: 'var(--_agent-logic-node-background)',
  passage: 'var(--_agent-logic-passage-background)',
  passageHover: 'var(--_agent-logic-hover-background)',
  selected: 'var(--_agent-logic-selected-background)',
  surface: 'var(--agent-logic-surface)',
  tooltip: 'var(--_agent-logic-tooltip-background)',
};

/** Each colour that the canvas draws, with the surfaces on which it sits and the floor that it meets there. */
const CONTRAST_PAIRS: { colour: string; surfaces: (keyof typeof SURFACES)[]; floor: number }[] = [
  {
    colour: 'var(--agent-logic-text)',
    surfaces: ['compound', 'ground', 'hover', 'node', 'passage', 'passageHover', 'selected', 'surface'],
    floor: 4.5,
  },
  {
    colour: 'var(--_agent-logic-text-subtle)',
    surfaces: ['compound', 'ground', 'node', 'passage', 'passageHover', 'selected', 'surface'],
    floor: 4.5,
  },
  { colour: 'var(--_agent-logic-text-subtlest)', surfaces: ['surface'], floor: 4.5 },
  { colour: 'var(--_agent-logic-danger-text)', surfaces: ['surface'], floor: 4.5 },
  { colour: 'var(--_agent-logic-tooltip-text)', surfaces: ['tooltip'], floor: 4.5 },
  { colour: 'var(--_agent-logic-border)', surfaces: ['compound', 'ground', 'node', 'surface'], floor: 3 },
  {
    colour: 'var(--_agent-logic-border-strong)',
    surfaces: ['compound', 'ground', 'node', 'passageHover', 'surface'],
    floor: 3,
  },
  { colour: 'var(--_agent-logic-focus-ring)', surfaces: ['compound', 'ground', 'node'], floor: 3 },
  { colour: 'var(--_agent-logic-selected)', surfaces: ['compound', 'ground', 'node', 'selected'], floor: 3 },
  { colour: 'var(--_agent-logic-source-line)', surfaces: ['ground', 'surface'], floor: 3 },
  {
    colour: 'var(--agent-logic-global)',
    surfaces: ['compound', 'ground', 'hover', 'node', 'passageHover', 'selected', 'surface'],
    floor: 3,
  },
  { colour: 'var(--_agent-logic-unconverted)', surfaces: ['passage', 'surface'], floor: 3 },
  { colour: 'var(--agent-logic-waiting)', surfaces: ['compound', 'node'], floor: 3 },
  { colour: 'var(--agent-logic-warning)', surfaces: ['compound', 'node'], floor: 3 },
];

const COMPONENT_PROPERTIES = [
  'ambient-background',
  'border',
  'border-strong',
  'compound-background',
  'danger-text',
  'focus-ring',
  'hover-background',
  'node-background',
  'passage-background',
  'selected',
  'selected-background',
  'source-line',
  'text-subtle',
  'text-subtlest',
  'tooltip-background',
  'tooltip-text',
  'unconverted',
];

const FONTS = new Set(['font-code', 'font-prose']);

/** The surfaces that are translucent, with the opaque surface over which each one is drawn. */
const SURFACE_GROUNDS: Partial<Record<keyof typeof SURFACES, keyof typeof SURFACES>> = {
  // The ambient instructions that take the hover background sit on a compound state.
  hover: 'compound',
  passageHover: 'surface',
};

describe('styles.css', () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it('does not read any ADS design token', () => {
    expect(STYLESHEET).not.toMatch(/--ds-/);
  });

  it('declares only the seeds and the fonts on :root', () => {
    const declared = readBlock(':where(:root)')
      .matchAll(/(--agent-logic-[a-z-]+):/g)
      .map(([, name]) => name)
      .toArray();

    expect(declared.toSorted()).toStrictEqual([...SEEDS, ...FONTS].map((name) => `--agent-logic-${name}`).toSorted());
  });

  it('resolves every component property from its public property, in the private block', () => {
    const block = readBlock(PRIVATE_BLOCK_START).replaceAll(/\s+/g, ' ').replaceAll('( ', '(');

    expect(
      COMPONENT_PROPERTIES.filter((name) => !block.includes(`--_agent-logic-${name}: var(--agent-logic-${name},`)),
    ).toStrictEqual([]);
  });

  it('reads only seeds and private properties outside the private block', () => {
    const rest = STYLESHEET.replace(readBlock(PRIVATE_BLOCK_START), '');
    const read = new Set(rest.matchAll(/var\(--agent-logic-([a-z-]+)[,)]/g).map(([, name = '']) => name));

    expect([...read].filter((name) => !SEEDS.includes(name) && !FONTS.has(name))).toStrictEqual([]);
  });

  // happy-dom does not inherit a custom property, so the canvas stands for the parts inside it, which inherit from it.
  it.each([
    ['the canvas', 'statechart-canvas', false],
    ['a key swatch outside the canvas', 'canvas-key__swatch', false],
    ['a mark glyph outside the canvas', 'mark-glyph', false],
    ['the prompt pane', 'prompt-pane', false],
    ['a prompt key outside the pane', 'prompt-key', false],
    ['the inspector', 'statechart-inspector', false],
    ['the source line', 'statechart-source-line', false],
    ['the workspace', 'statechart-workspace', false],
  ])('derives a component property of %s from seeds set on an ancestor', (_, className, isInCanvas) => {
    const style = readElementStyle(className, { isInCanvas, ancestorStyle: '--agent-logic-text: rgb(1, 2, 3)' });

    expect(style.getPropertyValue('--_agent-logic-border')).toContain('rgb(1, 2, 3)');
  });

  it('lets a component property set on an ancestor override its part', () => {
    const style = readElementStyle('statechart-canvas', {
      ancestorStyle: '--agent-logic-border: rgb(4, 5, 6)',
      isInCanvas: false,
    });

    expect(style.getPropertyValue('--_agent-logic-border').trim()).toBe('rgb(4, 5, 6)');
  });

  it('tints the ground and the dots from the seeds', () => {
    const style = readElementStyle('react-flow', { ancestorStyle: '--agent-logic-accent: rgb(7, 8, 9)' });

    expect(style.getPropertyValue('--xy-background-color-default')).toContain('rgb(7, 8, 9)');
    expect(style.getPropertyValue('--xy-background-pattern-dots-color-default')).toContain('rgb(7, 8, 9)');
  });

  it("leaves React Flow's own ground and dot properties to the consumer", () => {
    expect(STYLESHEET).not.toMatch(/--xy-background-(color|pattern-color):/);
  });

  it('underlines an ambient instruction in the global colour', () => {
    const style = readCanvasElementStyle('state-node__ambient', '');

    expect(style.getPropertyValue('text-decoration')).toBe('underline dotted 2px #b0307f');
  });

  it('drops the ambient underline at the shapes level of detail', () => {
    const style = readCanvasElementStyle('state-node__ambient', '', 'statechart-canvas__flow--shapes');

    expect(style.getPropertyValue('text-decoration')).toBe('none');
  });

  it('leaves used text in the prompt pane unmarked at rest', () => {
    const style = readElementStyle('prompt-pane__passage prompt-pane__passage--used', { isInCanvas: false });

    expect([style.getPropertyValue('text-decoration'), style.backgroundColor]).toStrictEqual(['', '']);
  });

  it.each([
    ['ambient', 'text-decoration', /^underline dotted 2px #b0307f$/],
    ['comment', 'font-style', /^italic$/],
    // happy-dom does not resolve `color-mix()`, so the line's colour is left to the contrast test.
    ['unconverted', 'text-decoration', /^underline wavy 1\.5px/],
    ['unused', 'text-decoration', /^underline dashed 1px/],
  ])('marks %s text in the prompt pane and in its key alike', (coverage, property, pattern) => {
    const passage = readElementStyle(`prompt-pane__passage--${coverage}`, { isInCanvas: false });
    const sample = readElementStyle(`prompt-key__sample--${coverage}`, { isInCanvas: false });

    expect(passage.getPropertyValue(property)).toMatch(pattern);
    expect(sample.getPropertyValue(property)).toBe(passage.getPropertyValue(property));
  });

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])('aligns an %s passage to the top of its line', (level) => {
    const heading = readElementStyle(`prompt-pane__passage prompt-pane__passage--${level}`, { isInCanvas: false });

    expect(heading.verticalAlign).toBe('top');
  });

  it("keeps a heading's marker muted when the heading is highlighted", () => {
    // happy-dom does not resolve the default's `color-mix()`, so the muted colour is set on the private property.
    const marker = readElementStyle(
      'prompt-pane__passage prompt-pane__passage--h2 prompt-pane__passage--heading-marker prompt-pane__passage--highlighted',
      { consumerCss: ':root { --_agent-logic-text-subtle: rgb(1, 2, 3); }', isInCanvas: false },
    );

    expect(marker.color).toBe('rgb(1, 2, 3)');
  });

  it('drops the line of a highlighted passage, except an unconverted one', () => {
    const ambient = readElementStyle('prompt-pane__passage--ambient prompt-pane__passage--highlighted', {
      isInCanvas: false,
    });
    const unconverted = readElementStyle('prompt-pane__passage--unconverted prompt-pane__passage--highlighted', {
      isInCanvas: false,
    });

    expect(ambient.getPropertyValue('text-decoration')).toBe('none');
    expect(unconverted.getPropertyValue('text-decoration')).toMatch(/^underline wavy /);
  });

  it('declares the seeds at the values of the chosen theme', () => {
    const declarations = readThemeDeclarations();

    expect(Object.fromEntries(SEEDS.map((name) => [name, declarations.get(`--agent-logic-${name}`)]))).toStrictEqual(
      DEFAULT_SEEDS,
    );
  });

  it('meets the WCAG 2.2 AA contrast floors with the default seeds', () => {
    expect(findContrastFailures(readThemeDeclarations())).toStrictEqual([]);
  });

  it('reports a contrast failure when a seed breaks a pair', () => {
    const declarations = readThemeDeclarations().set('--agent-logic-text', '#9a9a9a');

    expect(findContrastFailures(declarations)).toStrictEqual(
      expect.arrayContaining([expect.stringMatching(/^var\(--_agent-logic-text-subtle\) on surface /)]),
    );
  });

  it('draws a state in its default colour without any other stylesheet', () => {
    expect(readStateColour('')).toBe('#1c1f24');
  });

  it("draws a state in the consumer's colour when the consumer overrides the property", () => {
    expect(readStateColour(':root { --agent-logic-text: rgb(1, 2, 3); }')).toBe('rgb(1, 2, 3)');
  });

  it('pads the attribution on every side without any other stylesheet', () => {
    expect(readAttributionPadding('')).toStrictEqual(['3px', '6px', '3px', '6px']);
  });

  it("pads the attribution on every side under a consumer's layered reset", () => {
    const preflight = '@layer base { *, ::before, ::after { margin: 0; padding: 0; } }';

    expect(readAttributionPadding(preflight)).toStrictEqual(['3px', '6px', '3px', '6px']);
  });
});

// region | Helpers
interface ElementPlacement {
  ancestorStyle?: string;
  consumerCss?: string;
  flowClassName?: string;
  isInCanvas?: boolean;
}

/** Returns each pair of `CONTRAST_PAIRS` that falls below its floor under `declarations`, with its ratio. */
function findContrastFailures(declarations: Map<string, string>): string[] {
  return CONTRAST_PAIRS.flatMap(({ colour, surfaces, floor }) =>
    surfaces
      .map((surface) => ({
        surface,
        ratio: measureContrast(resolveColour(colour, declarations), resolveSurface(surface, declarations)),
      }))
      .filter(({ ratio }) => ratio < floor)
      .map(({ surface, ratio }) => `${colour} on ${surface} (${ratio.toFixed(2)}:1)`),
  );
}

/** Returns the computed top, right, bottom, and left padding of the canvas's attribution. */
function readAttributionPadding(consumerCss: string): string[] {
  const style = readCanvasElementStyle('react-flow__attribution', consumerCss);
  return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
}

/** Returns the stylesheet's rule block whose selector starts with `selectorStart`, up to its closing brace. */
function readBlock(selectorStart: string): string {
  const start = STYLESHEET.indexOf(selectorStart);
  if (start === -1) throw new Error(`The stylesheet does not contain a block starting with ${selectorStart}`);
  return STYLESHEET.slice(start, STYLESHEET.indexOf('}', start) + 1);
}

/**
 * Returns the computed style of an element of `className` inside a canvas, in a flow of `flowClassName`, under the
 * package stylesheet followed by `consumerCss`.
 */
function readCanvasElementStyle(className: string, consumerCss: string, flowClassName = ''): CSSStyleDeclaration {
  return readElementStyle(className, { consumerCss, flowClassName });
}

/**
 * Returns the computed style of an element of `className`, placed in a flow of `flowClassName` inside a canvas unless
 * `isInCanvas` is false, under an ancestor with the inline `ancestorStyle` and under the package stylesheet followed by
 * `consumerCss`.
 */
function readElementStyle(
  className: string,
  { ancestorStyle = '', consumerCss = '', flowClassName = '', isInCanvas = true }: ElementPlacement,
): CSSStyleDeclaration {
  for (const css of [STYLESHEET.replace(/^@import [^;]+;$/m, ''), consumerCss]) {
    const style = document.createElement('style');
    // happy-dom does not match a `:where()` whose selector list spans lines.
    style.textContent = css.replaceAll(/\s+/g, ' ');
    document.head.append(style);
  }
  const ancestor = document.createElement('div');
  ancestor.setAttribute('style', ancestorStyle);
  const element = document.createElement('div');
  element.className = className;
  if (isInCanvas) {
    const canvas = document.createElement('div');
    canvas.className = 'statechart-canvas';
    const flow = document.createElement('div');
    flow.className = flowClassName;
    flow.append(element);
    canvas.append(flow);
    ancestor.append(canvas);
  } else {
    ancestor.append(element);
  }
  document.body.append(ancestor);
  return getComputedStyle(element);
}

/** Returns the computed text colour of a state. */
function readStateColour(consumerCss: string): string {
  return readCanvasElementStyle('state-node', consumerCss).color;
}

/** Returns the custom properties that the default theme declares: the seeds, the private block, and the ground. */
function readThemeDeclarations(): Map<string, string> {
  return readDeclarations(STYLESHEET, [':where(:root)', PRIVATE_BLOCK_START, '.statechart-canvas .react-flow {']);
}

/** Returns the opaque colour of `surface`, compositing a translucent surface over its ground. */
function resolveSurface(surface: keyof typeof SURFACES, declarations: Map<string, string>) {
  const colour = resolveColour(SURFACES[surface], declarations);
  const ground = SURFACE_GROUNDS[surface] ?? 'compound';
  return colour.a < 1 ? composite(colour, resolveColour(SURFACES[ground], declarations)) : colour;
}
// endregion | Helpers
