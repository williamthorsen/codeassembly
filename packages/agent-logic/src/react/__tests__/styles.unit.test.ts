// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const STYLESHEET = readFileSync(path.join(import.meta.dirname, '../styles.css'), 'utf8');

describe('styles.css', () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it('does not read any ADS design token', () => {
    expect(STYLESHEET).not.toMatch(/--ds-/);
  });

  it('declares a default for every custom property that it reads', () => {
    const declared = new Set(STYLESHEET.matchAll(/^\s+(--agent-logic-[a-z-]+):/gm).map(([, name]) => name));
    const read = new Set(STYLESHEET.matchAll(/var\((--agent-logic-[a-z-]+)\)/g).map(([, name]) => name));

    expect([...read].filter((name) => !declared.has(name))).toStrictEqual([]);
  });

  it('draws a state in its default colour without any other stylesheet', () => {
    expect(readStateColour('')).toBe('#172b4d');
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
  for (const css of [STYLESHEET.replace(/^@import [^;]+;$/m, ''), consumerCss]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
  const canvas = document.createElement('div');
  canvas.className = 'statechart-canvas';
  const element = document.createElement('div');
  element.className = className;
  canvas.append(element);
  document.body.append(canvas);
  return getComputedStyle(element);
}

/** Returns the computed text colour of a state. */
function readStateColour(consumerCss: string): string {
  return readCanvasElementStyle('state-node', consumerCss).color;
}
// endregion | Helpers
