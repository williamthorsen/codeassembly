# Project stage

A project declares its stage in its own `.agents/preferences.yaml`, under `project`, and the session-context manifest reports each value as `project_maturity`, `project_sensitivity`, and `project_audience`, `null` when the project does not declare it. The global preferences file never supplies a stage, because a stage describes one repo.

## Values

| Key           | Value          | Meaning                                                                          |
| ------------- | -------------- | -------------------------------------------------------------------------------- |
| `maturity`    | `hobby`        | Built for the owner's own use or learning; breakage costs only the owner's time. |
|               | `early`        | In use by others, but the shape is still changing; downtime is tolerated.        |
|               | `production`   | Others depend on it; downtime and data loss have real costs.                     |
| `sensitivity` | `low`          | Nothing that would harm anyone if published.                                     |
|               | `personal`     | Personal data about the owner or identifiable individuals.                       |
|               | `confidential` | Secrets, credentials, or data that a third party is obliged to protect.          |
| `audience`    | `owner`        | Only the repo's owner uses it.                                                   |
|               | `team`         | A known, bounded group uses it.                                                  |
|               | `public`       | Anyone who can reach it uses it.                                                 |

## What each value implies

- **Security.** `owner` with `low` sensitivity needs only what keeps the owner's own credentials out of the repository; access control beyond the host's own login is machinery without an asset to protect. `personal` data warrants access limited to the people it concerns. Authentication with several factors, rate limits, and origin checks answer `public` users or `confidential` data.
- **Availability.** `hobby` tolerates a service that runs only while the owner works, such as a local process or a database on the owner's machine. `early` tolerates downtime and manual recovery. Hosted, always-available infrastructure and backups answer `production`.
- **Infrastructure.** Choose the least infrastructure on which the project runs at its declared stage: a file before a database, a local process before a hosted service, one environment before several.

## Rules

- **The declared values are premises.** Design for the stage that the project declares, not for the stage that a general-purpose system would assume. A design that serves requirements beyond the declared stage is wrong for this project, however sound it would be elsewhere.
- **Default to the least machinery that works for the declared stage.** Read [design priorities](design-priorities.md) against the stage: Behavioral correctness covers the cases that matter at that stage.
- **Escalate only for a named asset or need.** Add security, availability, or infrastructure beyond what the stage implies only when the design names what it protects or serves, such as "the tokens table holds the owner's API keys". State the asset or need in the ticket.
- **Make added hardening switchable.** A safeguard added beyond the stage, such as an origin check or a rate limit, is switched by configuration, so that a preview deployment or a local run can work without it.
- **Ask for an undeclared value; never infer it.** An undeclared value is a preference for which the agent holds no evidence, so it is in the gated class: Ask the developer rather than infer enterprise requirements from silence. Once the developer answers, declare the value in the project's `.agents/preferences.yaml` and run `node {harness_home_dir}/scripts/check-preferences.mjs` on the edited file, so that the question is asked once.
- **Record the premises.** State each value that decided a security, availability, or infrastructure question where the work records its decisions: in a ticket's `## Context`, one sentence per premise naming the value and the decision that it settled, and in a product's design doc.
