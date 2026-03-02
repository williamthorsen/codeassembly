import React, { useEffect, useRef } from 'react';

interface PacketAnimationProps {
  pathD: string;
  duration?: number;
  icon: 'document' | 'gear' | 'dot';
  color: string;
  onComplete?: () => void;
}

function DotIcon({ color }: { color: string }): React.JSX.Element {
  return <circle r="5" fill={color} />;
}

function DocumentIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <g transform="translate(-6, -8)">
      <rect width="12" height="16" rx="1" fill={color} opacity={0.9} />
      <polygon points="8,0 12,4 8,4" fill="white" opacity={0.5} />
    </g>
  );
}

function GearIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <g transform="translate(-6, -6)">
      <path d="M6,0 L8,2 L12,2 L10,4 L10,8 L8,6 L4,6 L4,8 L2,10 L0,8 L0,4 L2,2 L4,2 Z" fill={color} opacity={0.9} />
      <circle cx="6" cy="5" r="2" fill="white" opacity={0.5} />
    </g>
  );
}

const ICON_COMPONENTS: Record<PacketAnimationProps['icon'], React.ComponentType<{ color: string }>> = {
  dot: DotIcon,
  document: DocumentIcon,
  gear: GearIcon,
};

export function PacketAnimation({
  pathD,
  duration = 800,
  icon,
  color,
  onComplete,
}: PacketAnimationProps): React.JSX.Element {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (onComplete === undefined) return;

    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      try {
        onComplete();
      } catch (error) {
        console.error('[PacketAnimation] onComplete threw:', error);
      }
    }, duration);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [duration, onComplete]);

  const IconComponent = ICON_COMPONENTS[icon];
  const durString = `${String(duration)}ms`;

  return (
    <g>
      <IconComponent color={color} />
      <animateMotion dur={durString} path={pathD} fill="freeze" />
    </g>
  );
}
