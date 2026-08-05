import type { SessionSnapshot } from 'codeassembly-fleet';
import type { ReactElement } from 'react';

import { formatFreshness } from '../../format/freshness.ts';
import { Badge, Group, Text } from '../../integrations/mantine/index.ts';

const HARNESS_COLORS: Record<string, string> = {
  claude: 'violet',
  rovo: 'cyan',
};

interface SessionRowProps {
  nowMs: number;
  session: SessionSnapshot;
}

/**
 * One session's status line: short id, harness badge, phase narration with the pending ask, and freshness age.
 * A waiting session carries the accent treatment; a stale or ended one dims.
 */
export function SessionRow({ nowMs, session }: SessionRowProps): ReactElement {
  const ended = session.phase === 'ended';
  const waiting = session.phase === 'waiting';
  const dimmed = ended || session.stale;
  return (
    <Group
      data-test-id="session-row"
      gap="sm"
      opacity={dimmed ? 0.5 : 1}
      px="sm"
      py="xs"
      style={
        waiting
          ? { borderLeftColor: 'var(--mantine-color-yellow-6)', borderLeftStyle: 'solid', borderLeftWidth: 3 }
          : undefined
      }
    >
      <Text c="dimmed" ff="monospace" size="sm" title={session.session}>
        {session.session.slice(0, 8)}
      </Text>
      <Badge color={resolveHarnessColor(session.harness)} size="sm" variant="light">
        {session.harness ?? 'unknown'}
      </Badge>
      <Text fw={500} size="sm" {...(waiting ? { c: 'yellow' } : {})} {...(ended ? { td: 'line-through' } : {})}>
        {resolveLabel(session)}
      </Text>
      <Text c="dimmed" ml="auto" size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatFreshness(session.lastEventTs, nowMs)}
      </Text>
    </Group>
  );
}

// region | Helpers

function resolveHarnessColor(harness: string | null): string {
  return (harness === null ? undefined : HARNESS_COLORS[harness]) ?? 'gray';
}

/** The row's phase narration: the running skill while working, the pending ask's prompt while waiting. */
function resolveLabel(session: SessionSnapshot): string {
  if (session.phase === 'working') {
    return session.skill === null ? 'working' : `running ${session.skill}`;
  }
  if (session.phase === 'waiting') {
    const prompt = session.ask?.prompt;
    return typeof prompt === 'string' ? `waiting: ${prompt}` : 'waiting';
  }
  return session.phase;
}

// endregion | Helpers
