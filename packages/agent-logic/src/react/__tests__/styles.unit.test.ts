// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const STYLESHEET = readFileSync(path.join(import.meta.dirname, '../styles.css'), 'utf8');

const SEEDS = ['accent', 'global', 'surface', 'text', 'waiting', 'warning'];

const COMPONENT_PROPERTIES = [
  'ambient-background',
  'border',
  'border-strong',
  'compound-background',
  'focus-ring',
  'hover-background',
  'node-background',
  'selected',
  'selected-background',
  'text-subtle',
  'tooltip-background',
  'tooltip-text',
];

describe('styles.css', () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it('does not read any ADS design token', () => {
    expect(STYLESHEET).not.toMatch(/--ds-/);
  });

  it('declares only the seeds and the code font on :root', () => {
    const declared = [...readBlock(':where(:root)').matchAll(/(--agent-logic-[a-z-]+):/g)].map(([, name]) => name);

    expect(declared.toSorted()).toStrictEqual(
      [...SEEDS, 'font-code'].map((name) => `--agent-logic-${name}`).toSorted(),
    );
  });

  it('resolves every component property from its public property, in the private block', () => {
    const block = readBlock(':where(.statechart-canvas').replaceAll(/\s+/g, ' ').replaceAll('( ', '(');

    expect(
      COMPONENT_PROPERTIES.filter((name) => !block.includes(`--_agent-logic-${name}: var(--agent-logic-${name},`)),
    ).toStrictEqual([]);
  });

  it('reads only seeds and private properties outside the private block', () => {
    const rest = STYLESHEET.replace(readBlock(':where(.statechart-canvas'), '');
    const read = new Set([...rest.matchAll(/var\(--agent-logic-([a-z-]+)[,)]/g)].map(([, name]) => name));

    expect([...read].filter((name) => !SEEDS.includes(name) && name !== 'font-code')).toStrictEqual([]);
  });

  // happy-dom does not inherit a custom property, so the canvas stands for the parts inside it, which inherit from it.
  it.each([
    ['the canvas', 'statechart-canvas', false],
    ['a key swatch outside the canvas', 'canvas-key__swatch', false],
    ['a mark glyph outside the canvas', 'mark-glyph', false],
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
  isInCanvas?: boolean;
}

/** Returns the computed top, right, bottom, and left padding of the canvas's attribution. */
function readAttributionPadding(consumerCss: string): string[] {
  const style = readCanvasElementStyle('react-flow__attribution', consumerCss);
  return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
}

/**
 * Returns the computed style of an element of `className` inside a canvas, under the package stylesheet followed by
 * `consumerCss`.
 */
function readCanvasElementStyle(className: string, consumerCss: string): CSSStyleDeclaration {
  return readElementStyle(className, { consumerCss });
}

/**
 * Returns the computed style of an element of `className`, placed inside a canvas unless `isInCanvas` is false, under
 * an ancestor with the inline `ancestorStyle` and under the package stylesheet followed by `consumerCss`.
 */
function readElementStyle(
  className: string,
  { ancestorStyle = '', consumerCss = '', isInCanvas = true }: ElementPlacement,
): CSSStyleDeclaration {
  for (const css of [STYLESHEET.replace(/^@import [^;]+;$/m, ''), consumerCss]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
  const ancestor = document.createElement('div');
  ancestor.setAttribute('style', ancestorStyle);
  const element = document.createElement('div');
  element.className = className;
  if (isInCanvas) {
    const canvas = document.createElement('div');
    canvas.className = 'statechart-canvas';
    canvas.append(element);
    ancestor.append(canvas);
  } else {
    ancestor.append(element);
  }
  document.body.append(ancestor);
  return getComputedStyle(element);
}

/** Returns the stylesheet's rule block whose selector starts with `selectorStart`, up to its closing brace. */
function readBlock(selectorStart: string): string {
  const start = STYLESHEET.indexOf(selectorStart);
  if (start === -1) throw new Error(`The stylesheet does not contain a block starting with ${selectorStart}`);
  return STYLESHEET.slice(start, STYLESHEET.indexOf('}', start) + 1);
}

/** Returns the computed text colour of a state. */
function readStateColour(consumerCss: string): string {
  return readCanvasElementStyle('state-node', consumerCss).color;
}
// endregion | Helpers
