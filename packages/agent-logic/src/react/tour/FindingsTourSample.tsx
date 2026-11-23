import { type ReactElement, useId } from 'react';

/** Two findings as the Messages panel lists them: the kind of flaw as a tag, then what the model reports. */
export function FindingsTourSample(): ReactElement {
  const headingId = useId();
  return (
    <div className="findings-tour-sample">
      <p id={headingId} className="findings-tour-sample__heading">
        Messages: 2 findings
      </p>
      <ul aria-labelledby={headingId} className="findings-tour-sample__list">
        {FINDINGS.map(({ kind, text }) => (
          <li key={kind} className="findings-tour-sample__finding">
            <span className="findings-tour-sample__kind">{kind}</span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// region | Helpers
const FINDINGS: readonly { kind: string; text: string }[] = [
  { kind: 'Unhandled case', text: 'The prompt does not say what to do when the owner never replies.' },
  { kind: 'Contradiction', text: 'Step 2 says to approve every low-risk request, and step 5 says to reject some.' },
];
// endregion | Helpers
