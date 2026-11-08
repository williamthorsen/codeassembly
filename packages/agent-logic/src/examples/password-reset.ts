/** The bundled password reset example, unvalidated, so that it loads through the same path as a file. */
export const passwordReset: unknown = {
  id: 'reset_agent',
  initial: 'asking_for_email',
  states: {
    asking_for_email: {
      id: 'asking_for_email',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'ask the employee for their work email',
          },
        },
      ],
      on: {
        'user.gives_email': {
          target: '#sending_code',
          meta: {
            source: {
              start: 74,
              end: 109,
            },
          },
        },
      },
      meta: {
        name: 'Ask for the work email',
        source: {
          start: 35,
          end: 72,
        },
      },
    },
    sending_code: {
      id: 'sending_code',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'send a verification code to the email',
          },
        },
      ],
      always: {
        target: '#awaiting_code',
        meta: {
          source: {
            start: 111,
            end: 128,
          },
          inferred: true,
        },
      },
      meta: {
        name: 'Send the code',
        source: {
          start: 79,
          end: 110,
        },
      },
    },
    awaiting_code: {
      id: 'awaiting_code',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'ask for the code',
          },
        },
      ],
      on: {
        'user.gives_code': [
          {
            target: '#resetting',
            guard: {
              type: 'nl',
              params: {
                text: 'the code is correct',
              },
            },
            meta: {
              source: {
                start: 129,
                end: 151,
              },
            },
          },
          {
            target: '#counting_attempt',
            guard: {
              type: 'nl',
              params: {
                text: 'the code is wrong',
              },
            },
            meta: {
              source: {
                start: 211,
                end: 225,
              },
            },
          },
        ],
        'user.asks_to_resend': {
          actions: [
            {
              type: 'nl',
              params: {
                text: 'send the code again',
              },
            },
          ],
          meta: {
            source: {
              start: 339,
              end: 394,
            },
          },
        },
      },
      meta: {
        name: 'Ask for the code',
        source: {
          start: 111,
          end: 128,
        },
      },
    },
    counting_attempt: {
      id: 'counting_attempt',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'count the wrong code',
          },
        },
      ],
      always: [
        {
          target: '#locked',
          guard: {
            type: 'nl',
            params: {
              text: 'this is the third wrong code',
            },
          },
          meta: {
            source: {
              start: 257,
              end: 283,
            },
          },
        },
        {
          target: '#awaiting_code',
          meta: {
            source: {
              start: 227,
              end: 255,
            },
          },
        },
      ],
      meta: {
        name: 'Count the wrong code',
        source: {
          start: 238,
          end: 255,
        },
        inferred: true,
      },
    },
    resetting: {
      id: 'resetting',
      type: 'final',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'reset the password',
          },
        },
        {
          type: 'nl',
          params: {
            text: 'tell the employee that it is done',
          },
        },
      ],
      meta: {
        name: 'Reset the password',
        source: {
          start: 153,
          end: 209,
        },
      },
    },
    locked: {
      id: 'locked',
      type: 'final',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'lock the account',
          },
        },
        {
          type: 'nl',
          params: {
            text: 'tell the employee to contact IT',
          },
        },
      ],
      meta: {
        name: 'Lock the account',
        source: {
          start: 285,
          end: 337,
        },
      },
    },
  },
  meta: {
    name: 'Reset agent',
    prompt:
      'You reset passwords for employees.\nAsk the employee for their work email, then send a verification code to it. Ask for the code. If the code is correct, reset the password and tell the employee that it is done. If it is wrong, ask again, up to three times; after the third wrong code, lock the account and tell the employee to contact IT.\nIf the employee asks to resend the code, send it again.',
    source: {
      start: 0,
      end: 394,
    },
    unconverted: [],
  },
};
