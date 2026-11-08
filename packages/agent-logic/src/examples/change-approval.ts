/* eslint max-lines: off -- The file is one bundled config, which splitting would not make easier to read. */
/** The bundled change approval example, unvalidated, so that it loads through the same path as a file. */
export const changeApproval: unknown = {
  id: 'change_approval',
  initial: 'at_any_point_if',
  states: {
    at_any_point_if: {
      id: 'at_any_point_if',
      on: {
        'user.asks_to_cancel': {
          target: '#confirm_the_cancellation_and',
          meta: {
            source: {
              start: 981,
              end: 1004,
            },
          },
        },
      },
      initial: 'read_the_change_request',
      meta: {
        source: {
          start: 964,
          end: 1004,
        },
        name: 'Review the change request',
      },
      states: {
        read_the_change_request: {
          id: 'read_the_change_request',
          always: {
            target: '#fetch_the_list_of',
            meta: {
              source: {
                start: 367,
                end: 405,
              },
            },
          },
          entry: [
            {
              type: 'nl',
              params: {
                text: 'read the change request that the user links',
              },
            },
            {
              type: 'nl',
              params: {
                text: "note the change request's change type, service, and planned window",
              },
            },
          ],
          meta: {
            source: {
              start: 260,
              end: 303,
            },
            name: 'Read the change request',
          },
        },
        fetch_the_list_of: {
          id: 'fetch_the_list_of',
          always: {
            target: '#find_the_confluence_page',
            meta: {
              source: {
                start: 441,
                end: 502,
              },
            },
          },
          entry: [
            {
              type: 'nl',
              params: {
                text: 'fetch the list of pre-approved changes from the Standard Changes page',
              },
            },
          ],
          meta: {
            source: {
              start: 367,
              end: 436,
            },
            findings: [
              {
                kind: 'unused-input',
                sources: [
                  {
                    start: 373,
                    end: 405,
                  },
                ],
                reason:
                  'The agent fetches the list of pre-approved changes, but no later step checks the change against it; step 4 decides on the change type alone.',
              },
            ],
            name: 'Fetch the pre approved changes',
          },
        },
        find_the_confluence_page: {
          id: 'find_the_confluence_page',
          always: [
            {
              target: '#tell_the_requester_to',
              guard: {
                type: 'nl',
                params: {
                  text: 'the planned window falls in a freeze',
                },
              },
              meta: {
                source: {
                  start: 875,
                  end: 911,
                },
                inferred: true,
                findings: [
                  {
                    kind: 'inferred-resolution',
                    sources: [
                      {
                        start: 872,
                        end: 962,
                      },
                    ],
                    reason:
                      'Step 6 can be read as a check after the verdict is posted, as its position suggests, or as a check before any verdict; the chart checks the freeze before the verdict, because approving a change and then asking for a new window would leave a posted approval for a window that cannot be used.',
                  },
                ],
              },
            },
            {
              target: '#approve_the_change_and',
              guard: {
                type: 'nl',
                params: {
                  text: 'the change type is Standard',
                },
              },
              meta: {
                source: {
                  start: 546,
                  end: 573,
                },
              },
            },
            {
              target: '#ask_the_service_owner',
              guard: {
                type: 'nl',
                params: {
                  text: 'the change type is Normal',
                },
              },
              meta: {
                source: {
                  start: 641,
                  end: 666,
                },
              },
            },
          ],
          entry: [
            {
              type: 'nl',
              params: {
                text: 'find the Confluence page whose title matches the service name',
              },
            },
            {
              type: 'nl',
              params: {
                text: "read the service owner from the service's page",
              },
            },
          ],
          meta: {
            source: {
              start: 441,
              end: 538,
            },
            findings: [
              {
                kind: 'unhandled-case',
                sources: [
                  {
                    start: 441,
                    end: 502,
                  },
                ],
                reason:
                  'The prompt does not say what to do when no page, or more than one page, has a title that matches the service name, or when the page names no owner.',
              },
              {
                kind: 'unhandled-case',
                sources: [
                  {
                    start: 543,
                    end: 573,
                  },
                  {
                    start: 638,
                    end: 666,
                  },
                ],
                reason:
                  'The prompt branches only on Standard and Normal, and does not say what to do when the change type is another value, such as Emergency, or is empty.',
              },
            ],
            name: 'Read the service owner',
          },
        },
        approve_the_change_and: {
          id: 'approve_the_change_and',
          entry: [
            {
              type: 'nl',
              params: {
                text: 'approve the change',
              },
            },
            {
              type: 'nl',
              params: {
                text: 'post the verdict on the change request',
              },
            },
          ],
          type: 'final',
          meta: {
            source: {
              start: 575,
              end: 636,
            },
            name: 'Approve the standard change',
          },
        },
        ask_the_service_owner: {
          id: 'ask_the_service_owner',
          on: {
            'owner.replies': [
              {
                target: '#approve_the_change_if',
                guard: {
                  type: 'nl',
                  params: {
                    text: "the change's risk is low",
                  },
                },
                meta: {
                  source: {
                    start: 787,
                    end: 802,
                  },
                },
              },
              {
                target: '#reject_it_otherwise',
                meta: {
                  source: {
                    start: 818,
                    end: 827,
                  },
                },
              },
            ],
          },
          entry: [
            {
              type: 'nl',
              params: {
                text: 'ask the service owner to review the change',
              },
            },
            {
              type: 'nl',
              params: {
                text: "wait for the service owner's reply",
              },
            },
          ],
          meta: {
            source: {
              start: 668,
              end: 710,
            },
            findings: [
              {
                kind: 'unhandled-case',
                sources: [
                  {
                    start: 716,
                    end: 736,
                  },
                ],
                reason: 'The prompt does not say what to do when the service owner never replies, or how long to wait.',
              },
              {
                kind: 'unused-input',
                sources: [
                  {
                    start: 741,
                    end: 763,
                  },
                ],
                reason:
                  "The agent waits for the owner's reply, but the verdict depends on the change's risk rather than on what the owner says, and the prompt does not say where the risk comes from.",
              },
            ],
            name: 'Ask the owner to review',
          },
        },
        approve_the_change_if: {
          id: 'approve_the_change_if',
          entry: [
            {
              type: 'nl',
              params: {
                text: 'approve the change',
              },
            },
            {
              type: 'nl',
              params: {
                text: 'post the verdict on the change request',
              },
            },
          ],
          type: 'final',
          meta: {
            source: {
              start: 765,
              end: 802,
            },
            name: 'Approve the reviewed change',
          },
        },
        reject_it_otherwise: {
          id: 'reject_it_otherwise',
          entry: [
            {
              type: 'nl',
              params: {
                text: 'reject the change',
              },
            },
            {
              type: 'nl',
              params: {
                text: 'post the verdict on the change request',
              },
            },
          ],
          type: 'final',
          meta: {
            source: {
              start: 808,
              end: 827,
            },
            name: 'Reject the change',
          },
        },
        tell_the_requester_to: {
          id: 'tell_the_requester_to',
          entry: [
            {
              type: 'nl',
              params: {
                text: 'tell the requester to pick a new window',
              },
            },
          ],
          type: 'final',
          meta: {
            source: {
              start: 913,
              end: 961,
            },
            name: 'Ask for a new window',
          },
        },
      },
    },
    confirm_the_cancellation_and: {
      id: 'confirm_the_cancellation_and',
      entry: [
        {
          type: 'nl',
          params: {
            text: 'confirm the cancellation',
          },
        },
      ],
      type: 'final',
      meta: {
        source: {
          start: 1006,
          end: 1039,
        },
        name: 'Confirm the cancellation',
      },
    },
  },
  meta: {
    name: 'Change approval',
    prompt:
      '# Change approval agent\n\nYou review change requests for the platform team and post a verdict on each one.\n\nThe Change Policy page in Confluence is the only source of the approval rules and the verdict rule. Do not apply rules from anywhere else.\n\n## Steps\n\n1. Read the change request that the user links. Note its change type, its service, and its planned window.\n2. Fetch the list of pre-approved changes from the Standard Changes page.\n3. Find the Confluence page whose title matches the service name, and read the service owner from it.\n4. If the change type is Standard, approve the change and post the verdict on the change request. If the change type is Normal, ask the service owner to review the change, and wait for their reply.\n5. When the owner replies, approve the change if its risk is low, and reject it otherwise. Post the verdict on the change request.\n6. If the planned window falls in a freeze, tell the requester to pick a new window and stop.\n\nAt any point, if the user asks to cancel, confirm the cancellation and stop.\n',
    source: {
      start: 0,
      end: 1041,
    },
    unconverted: [],
    ambient: [
      {
        start: 25,
        end: 105,
      },
      {
        start: 107,
        end: 206,
      },
      {
        start: 207,
        end: 245,
      },
    ],
    findings: [
      {
        kind: 'contradiction',
        sources: [
          {
            start: 107,
            end: 205,
          },
          {
            start: 765,
            end: 827,
          },
        ],
        reason:
          'The prompt names the Change Policy page as the only source of the approval and verdict rules, yet states its own approval and verdict rules in steps 4 and 5 and never tells the agent to read that page.',
      },
    ],
  },
};
