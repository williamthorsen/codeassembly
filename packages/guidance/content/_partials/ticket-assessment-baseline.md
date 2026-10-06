A verdict is **baseline** when it does not indicate any concern or needed action:

| Dimension    | Baseline verdict |
| ------------ | ---------------- |
| Drift        | `none`           |
| Relevance    | `relevant`       |
| Progress     | `none`           |
| Advisability | `advisable`      |

An umbrella's `partial` progress is also baseline. An umbrella is a ticket that has open children and whose only unchecked criterion is "Every child is closed", so it is expected to be partly done until its last child closes. Any other unchecked criterion keeps `partial` progress a concern.

Complexity verdicts are purely informational and do not have a baseline.
