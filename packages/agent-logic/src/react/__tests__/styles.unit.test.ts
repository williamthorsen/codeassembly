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
});

// region | Helpers
/** Returns the computed text colour of a state under the package stylesheet followed by `consumerCss`. */
function readStateColour(consumerCss: string): string {
  for (const css of [STYLESHEET.replace(/^@import [^;]+;$/m, ''), consumerCss]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
  const state = document.createElement('div');
  state.className = 'state-node';
  document.body.append(state);
  return getComputedStyle(state).color;
}
// endregion | Helpers
