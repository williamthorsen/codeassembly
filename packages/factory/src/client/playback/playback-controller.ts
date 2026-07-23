import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'ended';

/** Generalized input for playback — a labeled sequence of snapshots from any source. */
export interface PlaybackSource {
  label: string;
  snapshots: CanonicalRunStatus[];
}

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
}

const MIN_SPEED = 0.25;
const MAX_SPEED = 32;
const BASE_INTERVAL_MS = 1500;
const MIN_INTERVAL_MS = 300;

/** Snapshot-based playback controller that steps through a sequence of `CanonicalRunStatus` snapshots. */
export class PlaybackController implements PlaybackControls {
  private readonly snapshots: ReadonlyArray<CanonicalRunStatus>;
  private readonly onUpdate: (status: CanonicalRunStatus) => void;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  state: PlaybackState = 'stopped';
  cursor = -1;
  speed = 1;

  get snapshotCount(): number {
    return this.snapshots.length;
  }

  constructor(snapshots: ReadonlyArray<CanonicalRunStatus>, onUpdate: (status: CanonicalRunStatus) => void) {
    this.snapshots = snapshots;
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
    if (this.cursor >= this.snapshots.length - 1) {
      this.state = 'ended';
      return;
    }

    this.cursor += 1;
    this.emitCurrent();

    if (this.cursor === this.snapshots.length - 1) {
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

  dispose(): void {
    this.cancelPending();
  }

  private emitCurrent(): void {
    const snapshot = this.cursor >= 0 ? this.snapshots[this.cursor] : undefined;
    if (snapshot !== undefined) {
      this.onUpdate(snapshot);
    }
  }

  private scheduleNext(): void {
    this.cancelPending();

    const nextIndex = this.cursor + 1;
    if (nextIndex >= this.snapshots.length) {
      this.state = 'ended';
      return;
    }

    const delay = Math.max(BASE_INTERVAL_MS / this.speed, MIN_INTERVAL_MS);

    this.pendingTimeout = setTimeout(() => {
      if (this.state !== 'playing') return;
      this.cursor = nextIndex;
      this.emitCurrent();
      this.scheduleNext();
    }, delay);
  }

  private cancelPending(): void {
    if (this.pendingTimeout === null) {
      return;
    }

    clearTimeout(this.pendingTimeout);
    this.pendingTimeout = null;
  }
}
