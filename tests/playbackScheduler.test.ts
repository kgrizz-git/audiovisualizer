import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LookaheadScheduler } from '../src/audio/playbackScheduler.js';

describe('LookaheadScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('dispatches only tasks within the lookahead window, in time order', () => {
    let clock = 0;
    const fired: number[] = [];
    const tasks = [
      { at: 5.0, run: () => fired.push(5) },
      { at: 0.1, run: () => fired.push(0.1) },
      { at: 0.2, run: () => fired.push(0.2) },
    ];
    const scheduler = new LookaheadScheduler(tasks, () => clock, 0.25, 25);
    scheduler.start();

    // At clock 0 the horizon is 0.25, so the two near tasks fire (sorted), the far one waits.
    expect(fired).toEqual([0.1, 0.2]);
    expect(scheduler.done).toBe(false);

    // Advance the clock and let the poll tick run.
    clock = 5.0;
    vi.advanceTimersByTime(25);
    expect(fired).toEqual([0.1, 0.2, 5]);
    expect(scheduler.done).toBe(true);
  });

  it('stops the poll timer once every task has fired', () => {
    let clock = 0;
    const tasks = [{ at: 10, run: () => {} }];
    const scheduler = new LookaheadScheduler(tasks, () => clock, 0.25, 25);
    scheduler.start();
    clock = 10;
    vi.advanceTimersByTime(25);
    expect(scheduler.done).toBe(true);
    const cleared = vi.getTimerCount();
    expect(cleared).toBe(0);
  });

  it('stop() halts further dispatch', () => {
    let clock = 0;
    const fired: number[] = [];
    const scheduler = new LookaheadScheduler(
      [{ at: 1, run: () => fired.push(1) }],
      () => clock,
      0.25,
      25,
    );
    scheduler.start();
    scheduler.stop();
    clock = 5;
    vi.advanceTimersByTime(100);
    expect(fired).toEqual([]);
  });
});
