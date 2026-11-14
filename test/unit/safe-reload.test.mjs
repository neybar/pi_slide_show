/**
 * Unit tests for the safe reload helper (www/js/safe-reload.mjs)
 */

import { describe, it, expect, vi } from 'vitest';
import { reloadBackoffDelay, createSafeReload } from '../../www/js/safe-reload.mjs';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(probeResults) {
  const timers = [];
  const reload = vi.fn();
  const onDeferred = vi.fn();
  let calls = 0;
  const probe = vi.fn(() => Promise.resolve(probeResults[Math.min(calls++, probeResults.length - 1)]));
  const safe = createSafeReload({
    probe,
    reload,
    baseMs: 5000,
    maxMs: 60000,
    onDeferred,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { timers[id - 1].cleared = true; },
  });
  return { safe, probe, reload, onDeferred, timers };
}

describe('reloadBackoffDelay()', () => {
  it('doubles from the base and caps at the max', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6].map((n) => reloadBackoffDelay(n, 5000, 60000));
    expect(delays).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
  });
});

describe('createSafeReload()', () => {
  it('reloads straight away when the probe passes', async () => {
    const { safe, reload, timers } = harness([true]);
    safe.request('test');
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(0);
    expect(safe.isPending()).toBe(false);
  });

  it('defers while the probe fails, with growing delays, then reloads once', async () => {
    const { safe, reload, onDeferred, timers } = harness([false, false, true]);
    safe.request('test');
    await flush();
    expect(reload).not.toHaveBeenCalled();
    expect(timers.map((t) => t.ms)).toEqual([5000]);
    expect(onDeferred).toHaveBeenCalledWith({ reason: 'test', attempt: 1, nextDelayMs: 5000 });

    timers[0].fn();
    await flush();
    expect(timers.map((t) => t.ms)).toEqual([5000, 10000]);

    timers[1].fn();
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(safe.isPending()).toBe(false);
  });

  it('keeps one request pending: further requests are ignored', async () => {
    const { safe, probe, timers } = harness([false]);
    expect(safe.request('a')).toBe(true);
    expect(safe.request('b')).toBe(false);
    await flush();
    expect(safe.request('c')).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);
  });

  it('cancel() stops a waiting request and allows a new one', async () => {
    const { safe, reload, timers, probe } = harness([false]);
    safe.request('a');
    await flush();
    safe.cancel();
    expect(timers[0].cleared).toBe(true);
    expect(safe.isPending()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(safe.request('b')).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('cancel() during an in-flight probe prevents the reload', async () => {
    const { safe, reload } = harness([true]);
    safe.request('a');
    safe.cancel();
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });
});
