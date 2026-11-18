/** A prompt with two steps, which {@link GREETER_DRAFT} converts. */
export const GREETER_PROMPT = 'Greet the user, then wait for a reply.\n\nWhen the user replies, finish.';

/** A valid draft of {@link GREETER_PROMPT}. */
export const GREETER_DRAFT = {
  initial: 'greeting',
  states: {
    greeting: {
      entry: [{ type: 'nl', params: { text: 'greet the user' } }],
      on: { 'user.replied': { target: '#done', meta: { quote: 'When the user replies' } } },
      meta: { quote: 'Greet the user, then wait for a reply' },
    },
    done: { type: 'final', meta: { quote: 'finish' } },
  },
  meta: { unconverted: [] },
};

/** A draft of {@link GREETER_PROMPT} whose quote does not occur in the prompt. */
export const MISQUOTED_GREETER_DRAFT = {
  ...GREETER_DRAFT,
  states: { ...GREETER_DRAFT.states, done: { type: 'final', meta: { quote: 'stop' } } },
};

/** A coverage map that quotes both blocks of {@link GREETER_PROMPT}. */
export const GREETER_MAP = [
  { quote: 'Greet the user', element: 'greeting' },
  { quote: 'When the user replies', element: 'user.replied' },
];
