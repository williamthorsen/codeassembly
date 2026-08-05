import { describe, expect, it } from 'vitest';

import { renderPreviewHtml } from '../preview-renderer.ts';

const STUB_SUBAGENT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96">subagent-stub</svg>';
const STUB_ORCHESTRATOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96">orchestrator-stub</svg>';

describe('renderPreviewHtml', () => {
  const html = renderPreviewHtml(STUB_SUBAGENT_SVG, STUB_ORCHESTRATOR_SVG);

  // ── Document structure ──────────────────────────────────────────────────

  it('returns a string starting with <!DOCTYPE html>', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('contains <html, <head>, and <body> tags', () => {
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  // ── Styling ─────────────────────────────────────────────────────────────

  it('uses the midnight blue background color #1a1a2e', () => {
    expect(html).toContain('#1a1a2e');
  });

  // ── Section labels ──────────────────────────────────────────────────────

  it('contains a subagent section label', () => {
    expect(html).toContain('<h2>subagent</h2>');
  });

  it('contains an orchestrator section label', () => {
    expect(html).toContain('<h2>orchestrator</h2>');
  });

  // ── Frame labels ────────────────────────────────────────────────────────

  const expectedLabels = [
    'Idle 1',
    'Idle 2',
    'Walking',
    'Resting 1',
    'Working 1',
    'Working 2',
    'Working 3',
    'Resting 2',
    'Celebrating 1',
    'Celebrating 2',
    'Concerned',
    'Resting 3',
  ];

  for (const label of expectedLabels) {
    it(`contains the frame label "${label}"`, () => {
      expect(html).toContain(label);
    });
  }

  // ── Animation script ───────────────────────────────────────────────────

  it('contains a <script> element for animation', () => {
    expect(html).toContain('<script>');
  });

  // ── SVG embedding ──────────────────────────────────────────────────────

  it('embeds the subagent SVG as a base64 data URI', () => {
    const expected = Buffer.from(STUB_SUBAGENT_SVG).toString('base64');
    expect(html).toContain(`data:image/svg+xml;base64,${expected}`);
  });

  it('embeds the orchestrator SVG as a base64 data URI', () => {
    const expected = Buffer.from(STUB_ORCHESTRATOR_SVG).toString('base64');
    expect(html).toContain(`data:image/svg+xml;base64,${expected}`);
  });
});
