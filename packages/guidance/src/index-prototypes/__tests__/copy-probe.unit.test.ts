import { Script } from 'node:vm';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { COPY_PROBE_SCRIPT } from '../copy-probe.ts';

describe('copy probe', () => {
  it('lists strings of four or more words and drops shorter ones', () => {
    const strings = probe(`
      <h1>Tokens</h1>
      <p>Make a token from a preset.</p>
      <button>Create token</button>
      <span>One two three</span>
      <span>One two three four</span>
    `);

    expect(strings).toEqual(['Make a token from a preset.', 'One two three four']);
  });

  it('keeps a sentence together across inline markup', () => {
    const strings = probe(`<p>Paste <strong>scope values</strong> as they <a href="#">appear</a> in a README.</p>`);

    expect(strings).toEqual(['Paste scope values as they appear in a README.']);
  });

  it('gathers text directly inside a div as one string', () => {
    const strings = probe(`<div>Expires in <b>30</b> days from now</div>`);

    expect(strings).toEqual(['Expires in 30 days from now']);
  });

  it('keeps a nested block container apart from its div', () => {
    const strings = probe(`<div>Choose a preset to begin. <p>Each preset grants read access only.</p></div>`);

    expect(strings).toEqual(['Choose a preset to begin.', 'Each preset grants read access only.']);
  });

  it('skips the demo band, scripts, styles, and templates', () => {
    const strings = probe(`
      <div data-demo><p>Scene one: the developer opens the page.</p><input placeholder="Demo scene name here"></div>
      <script>const note = 'four words in script';</script>
      <style>/* four words in style */</style>
      <template><p>Four words in a template.</p></template>
      <p>The name appears in the token list.</p>
    `);

    expect(strings).toEqual(['The name appears in the token list.']);
  });

  it('lists placeholders in document order', () => {
    const strings = probe(`
      <p>Names are shown to every admin.</p>
      <input placeholder="For example, CI deploy token">
      <p>Tokens expire after ninety days.</p>
    `);

    expect(strings).toEqual([
      'Names are shown to every admin.',
      'For example, CI deploy token',
      'Tokens expire after ninety days.',
    ]);
  });

  it('collapses whitespace and lists a repeated string once', () => {
    const strings = probe(`
      <p>Revoked tokens   stop working
        at once.</p>
      <li>Revoked tokens stop working at once.</li>
    `);

    expect(strings).toEqual(['Revoked tokens stop working at once.']);
  });

  it('counts text in hidden elements', () => {
    const strings = probe(`<p hidden>This token has been revoked.</p>`);

    expect(strings).toEqual(['This token has been revoked.']);
  });
});

// region | Helpers

/** Runs the probe source, as `browser_evaluate` receives it, against a page with the given body. */
function probe(body: string): unknown {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { runScripts: 'outside-only' });
  return new Script(`(${COPY_PROBE_SCRIPT})()`).runInContext(dom.getInternalVMContext());
}

// endregion | Helpers
