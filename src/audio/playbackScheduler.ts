export interface TimedTask {
  /** Absolute AudioContext time (seconds) at which the note should begin. */
  at: number;
  /** Create + start the Web Audio nodes for this note. Called once, just before `at`. */
  run: () => void;
}

/**
 * Schedules Web Audio tasks a short window ahead of the playhead instead of
 * allocating every source node up front. Creating thousands of AudioBufferSource/
 * Oscillator nodes at once is a known Chrome failure mode (glitches / silence past
 * ~400–1000 pre-scheduled notes), which made dense scores cut off mid-playback.
 *
 * The scheduler polls on a timer, reads the live AudioContext clock, and runs any
 * task whose start time falls within `lookahead` seconds. It stops itself once every
 * task has been dispatched.
 */
export class LookaheadScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private readonly tasks: TimedTask[];

  constructor(
    tasks: TimedTask[],
    private readonly currentTime: () => number,
    private readonly lookahead = 0.25,
    private readonly tickMs = 25,
  ) {
    this.tasks = [...tasks].sort((a, b) => a.at - b.at);
  }

  start(): void {
    if (this.timer !== null) return;
    this.pump();
    if (this.index >= this.tasks.length) return; // everything dispatched synchronously; no need to poll
    this.timer = setInterval(() => this.pump(), this.tickMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.index = this.tasks.length;
  }

  /** True once every task has been dispatched (used mainly for tests). */
  get done(): boolean {
    return this.index >= this.tasks.length;
  }

  private pump(): void {
    const horizon = this.currentTime() + this.lookahead;
    while (this.index < this.tasks.length && this.tasks[this.index].at <= horizon) {
      this.tasks[this.index].run();
      this.index += 1;
    }
    if (this.index >= this.tasks.length) this.stop();
  }
}
