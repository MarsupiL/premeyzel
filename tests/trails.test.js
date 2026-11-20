import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTrack, trackStats, exportGPX, parseGPX } from '../gpx.js';
import { createLocationTracker } from '../trail-location.js';

test('supplied hike has its original geometry, elevations and open endpoints', () => {
  const p = JSON.parse(
    readFileSync(new URL('../assets/trails/les-chataignes.json', import.meta.url)),
  );
  const stats = trackStats(normalizeTrack(p.track));
  assert.equal(p.activity, 'Marche');
  assert.equal(stats.points, 367);
  assert.equal(stats.distance, 9.11);
  assert.equal(stats.elevation, 343);
  assert.equal(stats.gap, 313);
  const xml = exportGPX(p);
  assert.match(xml, /<type>hiking<\/type>/);
  assert.doesNotMatch(xml, /<time>|<link/);
  assert.equal((xml.match(/<wpt /g) || []).length, 2);
});
test('disconnected GPX segments never gain an artificial connecting distance', () => {
  const track = normalizeTrack({
    segments: [
      [
        [45, 5, 100],
        [45.001, 5, 110],
      ],
      [
        [46, 6, 50],
        [46.001, 6, 45],
      ],
    ],
    waypoints: [],
  });
  const s = trackStats(track);
  assert.equal(s.distance, 0.22);
  assert.equal(s.elevation, 10);
  assert.equal(s.descent, 5);
  assert.equal(s.segments, 2);
  assert.equal(
    (
      exportGPX({ track, title: 'A & <B>', description: 'Été', activity: 'VTT' }).match(
        /<trkseg>/g,
      ) || []
    ).length,
    2,
  );
  assert.match(exportGPX({ track, title: 'A & <B>' }), /A &amp; &lt;B&gt;/);
});
test('missing elevation is unknown and invalid or excessive geometry is rejected', () => {
  assert.equal(
    trackStats(
      normalizeTrack({
        segments: [
          [
            [45, 5],
            [45.001, 5, 110],
          ],
        ],
      }),
    ).elevation,
    null,
  );
  for (const segments of [
    [
      [
        [100, 5],
        [45, 5],
      ],
    ],
    [
      [
        [45, NaN],
        [45, 5],
      ],
    ],
    [Array.from({ length: 20001 }, () => [45, 5])],
  ])
    assert.throws(() => normalizeTrack({ segments }));
  assert.throws(
    () => parseGPX('<!DOCTYPE gpx [<!ENTITY secret SYSTEM "file:///secret">]><gpx/>'),
    /déclaration XML/,
  );
});
test('GPS starts only on demand, handles stale fixes and ignores callbacks after close', () => {
  let good,
    bad,
    clock = 100000,
    calls = 0;
  const cleared = [],
    positions = [],
    statuses = [];
  const tracker = createLocationTracker({
    geolocation: {
      watchPosition(success, error, options) {
        calls++;
        good = success;
        bad = error;
        assert.equal(options.enableHighAccuracy, true);
        return 7;
      },
      clearWatch: (id) => cleared.push(id),
    },
    now: () => clock,
    onPosition: (p) => positions.push(p),
    onStatus: (s) => statuses.push(s),
  });
  assert.equal(calls, 0);
  tracker.start();
  tracker.start();
  assert.equal(calls, 1);
  const fix = (t) => ({ timestamp: t, coords: { latitude: 45, longitude: 5, accuracy: 8 } });
  good(fix(clock - 40000));
  assert.equal(positions.length, 0);
  good(fix(clock));
  assert.equal(positions.length, 1);
  clock += 40000;
  tracker.checkStale();
  assert.equal(statuses.at(-1).stale, true);
  tracker.stop();
  good(fix(clock));
  bad({ code: 1 });
  assert.equal(positions.length, 1);
  assert.deepEqual(cleared, [7]);
  assert.equal(tracker.active, false);
});
test('GPS refusal stops its watch even if the browser reports synchronously', () => {
  const cleared = [];
  let status;
  const tracker = createLocationTracker({
    geolocation: {
      watchPosition(_, bad) {
        bad({ code: 1 });
        return 3;
      },
      clearWatch: (id) => cleared.push(id),
    },
    onPosition() {},
    onStatus: (s) => (status = s),
  });
  tracker.start();
  assert.equal(tracker.active, false);
  assert.deepEqual(cleared, [3]);
  assert.match(status.message, /refusée/);
});
