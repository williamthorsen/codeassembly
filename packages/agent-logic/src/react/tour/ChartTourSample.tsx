import { type ReactElement, useId } from 'react';

import { FinalGlyph, InitialMark } from '../canvas/marks.tsx';

/**
 * A chart of three states and two transitions, drawn with the canvas's own start and end marks: a start, a branch, and
 * an end, which are the symbols that the Chart tour step explains.
 */
export function ChartTourSample(): ReactElement {
  const arrowheadId = useId();
  const markerEnd = `url(#${arrowheadId})`;
  return (
    <svg
      role="img"
      aria-label="A chart: Read the request branches to Approve when the risk is low, and to Ask the owner when it is high"
      viewBox="0 0 400 140"
      className="chart-tour-sample"
    >
      <defs>
        <marker id={arrowheadId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" className="chart-tour-sample__arrowhead" />
        </marker>
      </defs>

      <g transform="translate(14 64)">
        <InitialMark className="chart-tour-sample__initial" hasTitle={false} />
      </g>

      <State x={36} y={52} label="Read the request" />
      <path d="M 156 62 C 200 62, 200 28, 258 28" markerEnd={markerEnd} className="chart-tour-sample__transition" />
      <path d="M 156 78 C 200 78, 200 112, 258 112" markerEnd={markerEnd} className="chart-tour-sample__transition" />
      <text x="204" y="22" textAnchor="middle" className="chart-tour-sample__condition">
        Risk is low
      </text>
      <text x="204" y="132" textAnchor="middle" className="chart-tour-sample__condition">
        Risk is high
      </text>

      <State x={260} y={10} label="Approve" isFinal />
      <State x={260} y={94} label="Ask the owner" />
    </svg>
  );
}

// region | Helpers
const STATE_HEIGHT = 36;
const STATE_WIDTH = 120;

/** One state's box and name, with the end mark in its corner when the agent stops there. */
function State({
  x,
  y,
  label,
  isFinal = false,
}: {
  x: number;
  y: number;
  label: string;
  isFinal?: boolean;
}): ReactElement {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={STATE_WIDTH}
        height={STATE_HEIGHT}
        rx="4"
        className={isFinal ? 'chart-tour-sample__state chart-tour-sample__state--final' : 'chart-tour-sample__state'}
      />
      <text
        x={x + STATE_WIDTH / 2}
        y={y + STATE_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="chart-tour-sample__name"
      >
        {label}
      </text>
      {isFinal && (
        // An SVG nested in an SVG takes its size from attributes alone, so the glyph sits in HTML to keep its own size.
        <foreignObject x={x + STATE_WIDTH - 20} y={y + 4} width="16" height="16">
          <FinalGlyph hasTitle={false} />
        </foreignObject>
      )}
    </g>
  );
}
// endregion | Helpers
