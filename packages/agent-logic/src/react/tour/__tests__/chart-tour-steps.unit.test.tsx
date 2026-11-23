import type { TourStep } from '@williamthorsen/tour-react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  buildSelectionTourStep,
  CHART_TOUR_STEP,
  type ChartTourStep,
  FINDINGS_TOUR_STEP,
  PROMPT_TOUR_STEP,
} from '../chart-tour-steps.tsx';
import { ChartTourSample } from '../ChartTourSample.tsx';
import { FindingsTourSample } from '../FindingsTourSample.tsx';
import { PromptTourSample } from '../PromptTourSample.tsx';

describe('chart tour steps', () => {
  it("fits tour-react's step", () => {
    expectTypeOf<ChartTourStep>().toExtend<TourStep>();
  });

  it.each([
    ['Chart', CHART_TOUR_STEP, ChartTourSample, 'Follow each path that the agent can take', 3],
    ['Prompt', PROMPT_TOUR_STEP, PromptTourSample, 'Find the text that the chart leaves out', 3],
    ['Findings', FINDINGS_TOUR_STEP, FindingsTourSample, 'Review the findings on the prompt', 0],
  ])('shows the %s step with its sample as its visual', (eyebrow, step, Sample, title, pointCount) => {
    expect(step.eyebrow).toBe(eyebrow);
    expect(step.title).toBe(title);
    expect(step.visual?.type).toBe(Sample);
    expect(step.points ?? []).toHaveLength(pointCount);
  });

  it("builds the Selection step around the app's visual, without points", () => {
    const visual = <div>Page</div>;

    expect(buildSelectionTourStep(visual)).toStrictEqual({
      eyebrow: 'Selection',
      title: 'Check the chart against the prompt',
      lead: 'Select a state or a transition. The prompt highlights the passage that describes it, and a line connects the two. Select a passage, and the chart highlights its state or transition.',
      visual,
    });
  });
});
