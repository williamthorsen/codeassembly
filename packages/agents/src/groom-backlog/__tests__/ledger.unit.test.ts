import { describe, expect, it } from 'vitest';

import { parseLedger } from '../ledger.ts';

// One record of each shape that the calibration sweep wrote, its decision records in their three key sets.
const CALIBRATION_LINES = [
  '{"run":"cal","kind":"assessment","number":52,"assessedAt":"2026-10-01T00:26:11Z","sha":"3538c0ad","ticketUpdatedAt":"2026-02-28T19:32:21Z","verdicts":{"drift":"none","relevance":"uncertain","progress":"partial","advisability":"questionable","complexity":"involved"},"recommendation":"escalate","confidence":"medium","reason":"r","relatedTickets":[231],"inProgress":null}',
  '{"run":"cal","kind":"decision","number":62,"decision":"close-complete","actor":"agent","decidedBy":"user","appliedAt":"2026-10-01T00:38:02Z"}',
  '{"run":"cal","kind":"decision","number":78,"decision":"close-superseded","supersededBy":1903,"actor":"agent","decidedBy":"user","appliedAt":"2026-10-01T00:46:23Z"}',
  '{"run":"cal","kind":"decision","number":202,"decision":"close-superseded","rule":"half-met","actor":"agent","decidedBy":"user","appliedAt":"2026-10-01T00:55:16Z"}',
  '{"run":"cal","kind":"policy","decisions":{"skillName":"groom-backlog","verificationPass":false},"decidedBy":"user","recordedAt":"2026-10-01T00:51:18Z"}',
  '{"run":"cal","kind":"note","text":"Calibration complete.","recordedAt":"2026-10-01T00:58:46Z"}',
];

describe(parseLedger, () => {
  it("accepts every shape of the calibration's records and keeps their unknown fields", () => {
    const { defects, records } = parseLedger(`${CALIBRATION_LINES.join('\n')}\n`);

    expect(defects).toStrictEqual([]);
    expect(records.map((record) => record.kind)).toStrictEqual([
      'assessment',
      'decision',
      'decision',
      'decision',
      'policy',
      'note',
    ]);
    expect(records[3]).toMatchObject({ rule: 'half-met' });
  });

  it('reports a damaged line by number and reads the rest', () => {
    const { defects, records } = parseLedger(`${CALIBRATION_LINES[1]}\n{oops\n{"run":"cal","kind":"unknown"}\n`);

    expect(records).toHaveLength(1);
    expect(defects.map((defect) => defect.line)).toStrictEqual([2, 3]);
  });
});
