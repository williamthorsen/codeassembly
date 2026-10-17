import { describe, expect, it } from 'vitest';

import { PENDING, renderDispositionsComment, renderIssueComments } from '../render.ts';
import { buildItem, buildRecord } from '../test-utils/build-record.ts';

describe(renderDispositionsComment, () => {
  it('renders one row per item with the where column by disposition', () => {
    const comment = renderDispositionsComment(
      buildRecord({
        umbrella: 281,
        items: [
          buildItem({ ticket: 282 }),
          buildItem({ id: '24', disposition: 'comment', target: 272 }),
          buildItem({ id: '27', disposition: 'merge', target: '10' }),
          buildItem({ id: '16', disposition: 'drop', confidence: 'low' }),
        ],
      }),
    );

    expect(comment).toContain('The umbrella for the new tickets is #281.');
    expect(comment).toContain('| 10 Header search ranking | ticket | medium | should-have | #282 |');
    expect(comment).toContain('| 24 Header search ranking | comment | medium | should-have | #272 |');
    expect(comment).toContain('| 27 Header search ranking | merge | medium | should-have | merged into 10 |');
    expect(comment).toContain('| 16 Header search ranking | drop | low | should-have |  |');
    expect(comment).not.toContain('## Labels and follow-ups');
  });

  it('renders the rows in display order rather than record order', () => {
    const comment = renderDispositionsComment(
      buildRecord({
        items: [
          buildItem({ id: '16', disposition: 'drop', confidence: 'low' }),
          buildItem({ id: '10', value: 'nice-to-have' }),
          buildItem({ id: '27', disposition: 'merge', target: '12' }),
          buildItem({ id: '12', value: 'must-have' }),
        ],
      }),
    );

    const rows = comment.split('\n').filter((line) => /^\| \d+ /.test(line));
    expect(rows.map((row) => row.split(' ', 2)[1])).toEqual(['12', '27', '10', '16']);
  });

  it('renders placeholders for the numbers that step 7 has not assigned', () => {
    const comment = renderDispositionsComment(buildRecord());

    expect(comment).toContain(`The umbrella for the new tickets is ${PENDING}.`);
    expect(comment).toContain(`| ticket | medium | should-have | ${PENDING} |`);
  });

  it("renders each ticket item's blockers by issue number, with a placeholder for one not yet created", () => {
    const comment = renderDispositionsComment(
      buildRecord({
        items: [
          buildItem({ id: 'a', ticket: 290 }),
          buildItem({ id: 'b', ticket: 291, blockedBy: ['a', 412] }),
          buildItem({ id: 'c', blockedBy: ['d'] }),
          buildItem({ id: 'd' }),
        ],
      }),
    );

    expect(comment).toContain('| Where | Blocked by | Reason |');
    expect(comment).toContain('| #290 |  |');
    expect(comment).toContain('| #291 | #290, #412 |');
    expect(comment).toContain(`| ${PENDING} | ${PENDING} |`);
  });

  it('omits the umbrella sentence when the record does not have any item that takes a ticket', () => {
    const comment = renderDispositionsComment(
      buildRecord({ items: [buildItem({ disposition: 'drop', confidence: 'low' })] }),
    );

    expect(comment).not.toContain('umbrella');
  });

  it('escapes a pipe in a cell and renders the notes section when notes exist', () => {
    const comment = renderDispositionsComment(
      buildRecord({ items: [buildItem({ reason: 'a | b' })], notes: ['The labels were created directly.'] }),
    );

    expect(comment).toContain(String.raw`a \| b`);
    expect(comment).toContain('## Labels and follow-ups\n\n- The labels were created directly.');
  });
});

describe(renderIssueComments, () => {
  it('groups the items that comment on one issue into one comment', () => {
    const comments = renderIssueComments(
      buildRecord({
        items: [
          buildItem({ id: 'a', title: 'First', disposition: 'comment', target: 272 }),
          buildItem({ id: 'b', title: 'Second', disposition: 'comment', target: 272 }),
          buildItem({ id: 'c', title: 'Third', disposition: 'comment', target: 119 }),
          buildItem({ id: 'd' }),
        ],
      }),
    );

    expect(comments.keys().toArray()).toEqual([272, 119]);
    expect(comments.get(272)).toContain('(#278) routes the following to this issue:');
    expect(comments.get(272)).toContain('- **First** (confidence medium, value should-have):');
    expect(comments.get(272)).toContain('- **Second**');
    expect(comments.get(119)).not.toContain('First');
  });

  it('renders nothing when the record does not have any comment item', () => {
    expect(renderIssueComments(buildRecord({ items: [buildItem()] })).size).toBe(0);
  });
});
