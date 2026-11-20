import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHuntingFeed, zonePhase, zoneCountdown } from '../hunting-state.js';

test('planned zones become active at the start and disappear exactly at the end', () => {
  const zone = { startsAt: 100000, endsAt: 200000 };
  assert.equal(zonePhase(zone, 99999), 'planned');
  assert.equal(zonePhase(zone, 100000), 'active');
  assert.equal(zonePhase(zone, 200000), 'expired');
  assert.equal(zoneCountdown(zone, 100000), 'Encore 2 min');
  assert.equal(zoneCountdown(zone, 199999), 'Encore 1 min');
  assert.equal(zoneCountdown(zone, 200000), 'Terminée');
});
test('the feed uses server time despite device clock skew, expires offline and never presents failures as a current empty map', async () => {
  let tick = 0,
    fail = false;
  const feed = createHuntingFeed({
    clock: () => tick,
    fetchPage: async () => {
      if (fail) throw Error('offline');
      return {
        zones: [{ id: 'z', startsAt: 900, endsAt: 11000 }],
        serverNow: 1000,
        nextCursor: null,
      };
    },
  });
  assert.equal(feed.snapshot().stale, true);
  await feed.refresh();
  assert.equal(feed.now(), 1000);
  assert.equal(feed.snapshot().stale, false);
  tick = 9999;
  fail = true;
  await feed.refresh();
  assert.equal(feed.snapshot().zones.length, 1);
  assert.equal(feed.snapshot().stale, true);
  tick = 10000;
  assert.equal(feed.snapshot().zones.length, 0);
  assert.equal(feed.snapshot().stale, true);
  feed.destroy();
});
test('all pages are merged, role/removal changes refresh and repeating cursors fail safely', async () => {
  let pass = 0;
  const feed = createHuntingFeed({
    clock: () => 0,
    fetchPage: async (path) =>
      pass === 1
        ? { zones: [], serverNow: 1, nextCursor: null }
        : pass === 2
          ? { zones: [], serverNow: 1, nextCursor: 'a' }
          : {
              zones: [
                { id: path.includes('?') ? 'b' : 'a', startsAt: 0, endsAt: 999, canManage: false },
              ],
              serverNow: 1,
              nextCursor: path.includes('?') ? null : 'a',
            },
  });
  await feed.refresh();
  assert.equal(feed.snapshot().zones.length, 2);
  pass = 1;
  await feed.refresh();
  assert.equal(feed.snapshot().zones.length, 0);
  pass = 2;
  await feed.refresh();
  assert.equal(feed.snapshot().stale, true);
  feed.destroy();
});
test('unmount aborts and discards late responses; a post-write refresh waits for an older request then loads anew', async () => {
  let resolve,
    calls = 0,
    updates = 0,
    signal;
  const feed = createHuntingFeed({
    clock: () => 0,
    onChange: () => updates++,
    fetchPage: async (_path, options) => {
      calls++;
      signal = options.signal;
      if (calls === 1) await new Promise((r) => (resolve = r));
      return { zones: [], serverNow: 1, nextCursor: null };
    },
  });
  const initial = feed.refresh(),
    refreshed = feed.refresh(true);
  resolve();
  await Promise.all([initial, refreshed]);
  assert.equal(calls, 2);
  feed.destroy();
  assert.equal(signal.aborted, true);
  await feed.refresh();
  assert.equal(calls, 2);
  let release;
  const late = createHuntingFeed({
    onChange: () => updates++,
    fetchPage: () => new Promise((r) => (release = r)),
  });
  const pending = late.refresh(),
    before = updates;
  late.destroy();
  release({ zones: [{ id: 'late', endsAt: 9999999999999 }], serverNow: 1, nextCursor: null });
  await pending;
  assert.equal(updates, before);
  assert.equal(late.snapshot().zones.length, 0);
});
