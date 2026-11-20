import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createOfflineStore, planOfflineTrail, tileURL, PACK_PREFIX } from '../trail-offline.js';

const trail = {
  id: 'route-a',
  title: 'Les Châtaignes',
  revision: 2,
  canManage: true,
  mine: true,
  photo: 'private-photo',
  track: {
    segments: [
      [
        [45.686, 5.645],
        [45.687, 5.646],
      ],
    ],
  },
};
const image = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
function memoryStorage() {
  const data = new Map();
  return {
    data,
    async keys() {
      return [...data.keys()];
    },
    async delete(name) {
      return data.delete(name);
    },
    async open(name) {
      if (!data.has(name)) data.set(name, new Map());
      const entries = data.get(name);
      return {
        async keys() {
          return [...entries.keys()].map((url) => ({ url }));
        },
        async put(key, response) {
          entries.set(typeof key === 'string' ? key : key.url, response.clone());
        },
        async match(key) {
          return entries.get(typeof key === 'string' ? key : key.url)?.clone();
        },
      };
    },
  };
}
test('offline plan covers both IGN layers, intermediate segments and a margin at every saved zoom', () => {
  const plan = planOfflineTrail(trail);
  assert.ok(plan.bounds[0][0] < 45.68 && plan.bounds[1][1] > 5.65);
  assert.equal(new Set(plan.urls).size, plan.urls.length);
  const tiles = plan.urls.map((url) => new URL(url));
  for (let z = 10; z <= 16; z++)
    for (const layer of ['GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'ELEVATION.CONTOUR.LINE'])
      assert.ok(
        tiles.some(
          (url) =>
            url.searchParams.get('TILEMATRIX') === String(z) &&
            url.searchParams.get('LAYER') === layer,
        ),
      );
  assert.ok(plan.urls.length <= 1200);
  assert.throws(
    () =>
      planOfflineTrail({
        track: {
          segments: [
            [
              [45, 5],
              [46, 7],
            ],
          ],
        },
      }),
    /trop étendu/,
  );
  assert.throws(
    () =>
      planOfflineTrail({
        track: {
          segments: [
            [
              [NaN, 5],
              [46, 7],
            ],
          ],
        },
      }),
    /zone prise en charge/,
  );
  assert.throws(() => planOfflineTrail({}), /tracé complet/);
});
test('a complete download survives reopening, strips privileges, and is removable without touching other caches', async () => {
  const storage = memoryStorage(),
    progress = [];
  await storage.open('premeyzel-static-current');
  const store = createOfflineStore({
    storage,
    fetcher: async (_url, options) => {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'reload');
      return image();
    },
  });
  const pack = await store.save(trail, { onProgress: (p) => progress.push(p) });
  assert.equal(progress.at(-1).done, pack.urls.length);
  const [reopened] = await createOfflineStore({ storage }).list();
  assert.deepEqual(reopened.trail.track, trail.track);
  assert.equal(reopened.trail.canManage, false);
  assert.equal(reopened.trail.mine, false);
  assert.equal(reopened.trail.photo, undefined);
  await store.remove(trail.id);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await storage.keys(), ['premeyzel-static-current']);
});
test('failed, cancelled and quota-limited updates preserve the previous complete pack', async () => {
  for (const mode of ['network', 'http', 'quota', 'abort']) {
    const storage = memoryStorage();
    const old = await createOfflineStore({ storage, fetcher: async () => image() }).save(trail);
    const controller = new AbortController();
    const store = createOfflineStore({
      storage,
      fetcher: async () => {
        if (mode === 'network') throw new TypeError('Network unavailable');
        if (mode === 'http') return new Response('Unavailable', { status: 503 });
        if (mode === 'quota') throw new DOMException('Full', 'QuotaExceededError');
        controller.abort();
        return image();
      },
    });
    await assert.rejects(store.save({ ...trail, revision: 3 }, { signal: controller.signal }));
    assert.deepEqual(
      (await store.list()).map((p) => p.name),
      [old.name],
    );
    assert.deepEqual(await storage.keys(), [old.name]);
  }
});
test('an evicted tile invalidates readiness and unfinished transactions stay hidden', async () => {
  const storage = memoryStorage();
  const store = createOfflineStore({ storage, fetcher: async () => image() });
  const pack = await store.save(trail);
  storage.data.get(pack.name).delete(pack.urls[0]);
  await storage.open(PACK_PREFIX + 'unfinished');
  assert.deepEqual(await store.list(), []);
  await store.remove(trail.id);
  assert.ok(!storage.data.has(pack.name), 'a damaged pack remains removable');
});
test('five packs cap storage growth and a denied cross-tab lock makes no network requests', async () => {
  const storage = memoryStorage();
  const store = createOfflineStore({ storage, fetcher: async () => image() });
  for (let n = 0; n < 5; n++) await store.save({ ...trail, id: 'route-' + n });
  await assert.rejects(store.save({ ...trail, id: 'sixth' }), /cinq cartes/);
  let fetches = 0;
  const locked = createOfflineStore({
    storage,
    locks: { request: (_name, _options, run) => run(null) },
    fetcher: () => fetches++,
  });
  await assert.rejects(locked.save(trail), /autre fenêtre/);
  assert.equal(fetches, 0);
});
test('the actual service worker serves saved IGN tiles offline and never intercepts private APIs', async () => {
  const storage = memoryStorage();
  const pack = await createOfflineStore({ storage, fetcher: async () => image() }).save(trail);
  const listeners = {},
    fetched = [];
  let online = false;
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://village.example' },
      addEventListener: (name, fn) => (listeners[name] = fn),
    },
    URL,
    Request,
    Response,
    caches: storage,
    fetch: async (request) => {
      fetched.push(request.url);
      if (!online) throw new TypeError('Offline');
      return image();
    },
  });
  function load(url, options) {
    let handled;
    listeners.fetch({
      request: new Request(url, options),
      respondWith: (promise) => (handled = promise),
    });
    return handled;
  }
  const response = await load(pack.urls[0]);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(fetched.length, 0);
  assert.equal(load('https://supabase.example/auth/v1/user'), undefined);
  assert.equal(load('https://backend.example/api/messages'), undefined);
  assert.equal(load('https://data.geopf.fr/wmts?LAYER=PRIVATE'), undefined);
  await assert.rejects(load(tileURL(0, 18, 1, 1)), /Offline/);
  online = true;
  await load(pack.urls[0], { cache: 'reload' });
  assert.equal(fetched.at(-1), pack.urls[0], 'refresh bypasses previous map tiles');
});
