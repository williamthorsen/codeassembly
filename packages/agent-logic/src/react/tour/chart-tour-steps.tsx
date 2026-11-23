import type { ReactElement } from 'react';

import { ChartTourSample } from './ChartTourSample.tsx';
import { FindingsTourSample } from './FindingsTourSample.tsx';
import { PromptTourSample } from './PromptTourSample.tsx';

/** One slide of a tour, in the shape of `@williamthorsen/tour-react`'s `TourStep`, to which it is assignable. */
export interface ChartTourStep {
  /** A short label naming the step's role, such as "Chart" or "Prompt". */
  eyebrow: string;
  title: string;
  /** One or two sentences under the title. */
  lead: string;
  /** A React element that illustrates the step. */
  visual?: ReactElement | undefined;
  /** Short bullets under the visual. */
  points?: readonly string[] | undefined;
}

/**
 * Builds the tour step that explains selection, around the app's own visual of its page, because the page that
 * surrounds the chart and the prompt is the app's.
 */
export function buildSelectionTourStep(visual: ReactElement): ChartTourStep {
  return {
    eyebrow: 'Selection',
    title: 'Check the chart against the prompt',
    lead: 'Select a state or a transition. The prompt highlights the passage that describes it, and a line connects the two. Select a passage, and the chart highlights its state or transition.',
    visual,
  };
}

/** The tour step that explains the chart's states, transitions, and branches. */
export const CHART_TOUR_STEP: ChartTourStep = {
  eyebrow: 'Chart',
  title: 'Follow each path that the agent can take',
  lead: "The chart draws the prompt's logic as boxes and arrows. A dot marks where the agent starts and a ring marks where it ends, and the legend under the chart names every symbol.",
  visual: <ChartTourSample />,
  points: [
    "A box is a state: one step of the agent's work.",
    'An arrow is a transition: the event or condition that moves the agent to the next state.',
    'A state with two arrows leaving it is a branch.',
  ],
};

/** The tour step that explains the converter's findings and the Messages panel. */
export const FINDINGS_TOUR_STEP: ChartTourStep = {
  eyebrow: 'Findings',
  title: 'Review the findings on the prompt',
  lead: "The model that converts the prompt also reports findings: flaws in the prompt, such as the two below. The Messages panel under the chart lists them, and each finding links to its state or its passage. A finding is the model's judgment, so check it against the prompt.",
  visual: <FindingsTourSample />,
};

/** The tour step that explains the prompt's underlined text. */
export const PROMPT_TOUR_STEP: ChartTourStep = {
  eyebrow: 'Prompt',
  title: 'Find the text that the chart leaves out',
  lead: "Not all of a prompt's text becomes a state or a transition. The prompt underlines the rest, with one style of underline for each of three kinds.",
  visual: <PromptTourSample />,
  points: [
    'Ambient: an instruction that applies throughout, rather than at one step.',
    'Not used: text without any logic to draw, such as a sentence that introduces the agent.',
    'Not converted: logic that a chart cannot express, such as what to do usually rather than always. Review each one.',
  ],
};
