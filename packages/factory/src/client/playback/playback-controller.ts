import { foldEvents } from '../../shared/event-folder.js';
import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import type { RunEvent, RunHeader } from '../../shared/types/run-log.js';

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'ended';

/** Control methods exposed by the PlaybackController, used by UI components. */
export interface PlaybackControls {
  play(): void;
  pause(): void;
  stop(): void;
  stepForward(): void;
  stepBackward(): void;
  faster(): void;
  slower(): void;
  resetSpeed(): void;
  setSpeed(n: number): void;
  setNormalized(on: boolean): void;
}

const MIN_SPEED = 0.25;
const MAX_SPEED = 128;
const MAX_GAP_MS = 10_000;

export class PlaybackController implements PlaybackControls {
  private readonly header: RunHeader;
  private readonly events: ReadonlyArray<RunEvent>;
  private readonly onUpdate: (status: CanonicalRunStatus) => void;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  private normalized = true;

  state: PlaybackState = 'stopped';
  cursor = -1;
  speed = 1;

  get eventCount(): number {
    return this.events.length;
  }

  constructor(header: RunHeader, events: ReadonlyArray<RunEvent>, onUpdate: (status: CanonicalRunStatus) => void) {
    this.header = header;
    this.events = events;
    this.onUpdate = onUpdate;
  }

  play(): void {
    if (this.state === 'ended') return;

    this.state = 'playing';

    if (this.cursor < 0) {
      this.cursor = 0;
    }

    this.emitCurrent();
    this.scheduleNext();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.cancelPending();
    this.state = 'paused';
  }

  stop(): void {
    this.cancelPending();
    this.cursor = -1;
    this.state = 'stopped';
  }

  stepForward(): void {
    if (this.cursor >= this.events.length - 1) {
      if (this.cursor === this.events.length - 1) {
        this.state = 'ended';
      }
      return;
    }

    this.cursor += 1;
    this.emitCurrent();

    if (this.cursor === this.events.length - 1) {
      this.state = 'ended';
    } else if (this.state === 'stopped') {
      this.state = 'paused';
    }
  }

  stepBackward(): void {
    if (this.cursor <= -1) return;

    this.cursor -= 1;
    this.emitCurrent();

    if (this.state === 'ended') {
      this.state = 'paused';
    }
  }

  faster(): void {
    this.setSpeed(Math.min(this.speed * 2, MAX_SPEED));
  }

  slower(): void {
    this.setSpeed(Math.max(this.speed / 2, MIN_SPEED));
  }

  resetSpeed(): void {
    this.speed = 1;
  }

  setSpeed(n: number): void {
    this.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, n));
  }

  setNormalized(on: boolean): void {
    this.normalized = on;
  }

  dispose(): void {
    this.cancelPending();
  }

  private emitCurrent(): void {
    const eventsSlice = this.cursor >= 0 ? this.events.slice(0, this.cursor + 1) : [];
    const status = foldEvents(this.header, eventsSlice);
    this.onUpdate(status);
  }

  private scheduleNext(): void {
    this.cancelPending();

    const nextIndex = this.cursor + 1;
    if (nextIndex >= this.events.length) {
      this.state = 'ended';
      return;
    }

    const currentEvent = this.events[this.cursor];
    const nextEvent = this.events[nextIndex];

    if (!currentEvent || !nextEvent) return;

    let gapMs = new Date(nextEvent.t).getTime() - new Date(currentEvent.t).getTime();
    if (this.normalized && gapMs > MAX_GAP_MS) {
      gapMs = MAX_GAP_MS;
    }
    const delay = gapMs / this.speed;

    this.pendingTimeout = setTimeout(() => {
      if (this.state !== 'playing') return;
      this.cursor = nextIndex;
      this.emitCurrent();
      this.scheduleNext();
    }, delay);
  }

  private cancelPending(): void {
    if (this.pendingTimeout !== null) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
  }
}
