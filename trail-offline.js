// Only public route data and the two open IGN layers are stored here. No account,
// message, live hunting report or location history belongs in an offline pack.
export const PACK_PREFIX = 'premeyzel-offline-route-v1-';
const META = new URL('./offline-route.json', import.meta.url).href;
export const MIN_OFFLINE_ZOOM = 10;
export const MAX_OFFLINE_ZOOM = 16;
const MAX_TILES = 1200;
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_PACKS = 5;
export const MAP_LAYERS = [
  ['GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'PM_0_19'],
  ['ELEVATION.CONTOUR.LINE', 'PM_6_18'],
];
export function tileURL(layer, z = '{z}', x = '{x}', y = '{y}') {
  const [name, matrix] = MAP_LAYERS[layer];
  return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${name}&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=${matrix}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
}
const tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat, z) => {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** z);
};
export function planOfflineTrail(trail) {
  let south = Infinity,
    north = -Infinity,
    west = Infinity,
    east = -Infinity,
    count = 0;
  for (const segment of trail.track?.segments || []) {
    for (const [lat, lon] of segment) {
      if (
        !Number.isFinite(lat) ||
        Math.abs(lat) > 84 ||
        !Number.isFinite(lon) ||
        Math.abs(lon) > 179
      )
        throw new Error('Ce parcours se trouve hors de la zone prise en charge.');
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      if (++count > 20000) throw new Error('Ce parcours contient trop de points.');
    }
  }
  if (count < 2) throw new Error('Le tracé complet est nécessaire pour préparer la carte.');
  // A kilometre of margin around the route's extent, including between GPX points.
  const latMargin = 1 / 111;
  const lonMargin =
    1 / (111 * Math.cos((Math.max(Math.abs(south), Math.abs(north)) * Math.PI) / 180));
  const bounds = [
    [south - latMargin, west - lonMargin],
    [north + latMargin, east + lonMargin],
  ];
  const ranges = [];
  let total = 0;
  for (let z = MIN_OFFLINE_ZOOM; z <= MAX_OFFLINE_ZOOM; z++) {
    const range = {
      z,
      x0: tileX(bounds[0][1], z),
      x1: tileX(bounds[1][1], z),
      y0: tileY(bounds[1][0], z),
      y1: tileY(bounds[0][0], z),
    };
    total += (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) * MAP_LAYERS.length;
    if (total > MAX_TILES)
      throw new Error(
        'Ce parcours est trop étendu pour un téléchargement hors ligne. Utilisez son GPX dans une application de randonnée.',
      );
    ranges.push(range);
  }
  const urls = [];
  for (const { z, x0, x1, y0, y1 } of ranges)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let layer = 0; layer < MAP_LAYERS.length; layer++) urls.push(tileURL(layer, z, x, y));
  return { bounds, urls };
}
function publicCopy(trail) {
  const copy = {};
  for (const field of [
    'id',
    'title',
    'activity',
    'difficulty',
    'description',
    'authorName',
    'distance',
    'elevation',
    'duration',
    'revision',
    'track',
  ])
    copy[field] = trail[field];
  return { ...copy, preview: false, canManage: false, mine: false, offlineCopy: true };
}
// Injectable browser services keep transaction, failure and eviction tests real.
export function createOfflineStore({
  storage = globalThis.caches,
  fetcher = globalThis.fetch,
  now = Date.now,
  uuid = () => crypto.randomUUID(),
  locks = globalThis.navigator?.locks,
} = {}) {
  let busy = false;
  async function list() {
    if (!storage) return [];
    const result = [];
    for (const name of await storage.keys()) {
      if (!name.startsWith(PACK_PREFIX)) continue;
      const cache = await storage.open(name);
      const response = await cache.match(META);
      if (!response) continue;
      try {
        const pack = await response.json();
        if (pack.complete && pack.trail?.id && Array.isArray(pack.urls)) {
          // A marker alone is not enough after partial storage eviction.
          const keys = new Set((await cache.keys()).map((key) => key.url));
          if (pack.urls.every((url) => keys.has(url))) result.push({ ...pack, name });
        }
      } catch {
        /* A damaged/incomplete pack is never advertised as ready. */
      }
    }
    return result.sort((a, b) => b.savedAt - a.savedAt);
  }
  async function remove(id) {
    for (const name of await storage.keys()) {
      if (!name.startsWith(PACK_PREFIX)) continue;
      const response = await (await storage.open(name)).match(META);
      const pack = await response?.json().catch(() => null);
      if (pack?.trail?.id === id) await storage.delete(name);
    }
  }
  async function save(trail, { signal, onProgress = () => {} } = {}) {
    if (!storage) throw new Error('Le stockage hors ligne est indisponible sur cet appareil.');
    if (busy) throw new Error('Un téléchargement est déjà en cours.');
    busy = true;
    const run = async () => {
      signal?.throwIfAborted();
      const plan = planOfflineTrail(trail);
      const packs = await list();
      if (packs.filter((p) => p.trail.id !== trail.id).length >= MAX_PACKS)
        throw new Error(
          'Vous avez déjà cinq cartes. Retirez une copie hors ligne avant d’en ajouter une.',
        );
      // Clean only abandoned transactions; never another tab's active download.
      for (const name of await storage.keys()) {
        if (!name.startsWith(PACK_PREFIX) || packs.some((p) => p.name === name)) continue;
        const stamp = Number(name.slice(PACK_PREFIX.length).split('-')[0]);
        if (Number.isFinite(stamp) && now() - stamp > 86400000) await storage.delete(name);
      }
      const name = PACK_PREFIX + now() + '-' + uuid();
      const cache = await storage.open(name);
      const abort = new AbortController();
      const cancel = () => abort.abort(signal.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      let done = 0,
        index = 0,
        bytes = 0,
        failure;
      const used = packs.reduce((sum, p) => sum + p.bytes, 0);
      try {
        // Commit marker is written last. A failed refresh retains the old pack.
        onProgress({ done, total: plan.urls.length, bytes });
        async function download() {
          while (index < plan.urls.length) {
            abort.signal.throwIfAborted();
            const url = plan.urls[index++];
            try {
              const response = await fetcher(url, {
                mode: 'cors',
                credentials: 'omit',
                cache: 'reload',
                signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
              });
              if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png'))
                throw new Error(
                  'Une partie de la carte IGN est indisponible. Réessayez avec une connexion stable.',
                );
              const blob = await response.clone().blob();
              if (!blob.size || blob.size > 1024 * 1024)
                throw new Error('Une image de la carte est invalide.');
              bytes += blob.size;
              if (bytes + used > MAX_BYTES)
                throw new Error(
                  'La limite de 150 Mo de cartes est atteinte. Retirez une copie hors ligne.',
                );
              abort.signal.throwIfAborted();
              await cache.put(url, response);
              onProgress({ done: ++done, total: plan.urls.length, bytes });
            } catch (error) {
              failure ||= error;
              abort.abort();
              throw error;
            }
          }
        }
        // Two requests at a time: bounded memory and polite use of the IGN service.
        await Promise.allSettled([download(), download()]);
        if (failure) throw failure;
        signal?.throwIfAborted();
        if (done !== plan.urls.length) throw new Error('Le téléchargement a été interrompu.');
        const pack = {
          complete: true,
          trail: publicCopy(trail),
          savedAt: now(),
          bytes,
          bounds: plan.bounds,
          urls: plan.urls,
        };
        await cache.put(META, Response.json(pack));
        // Cleanup cannot roll back an already committed replacement.
        for (const old of packs.filter((p) => p.trail.id === trail.id))
          await storage.delete(old.name).catch(() => {});
        return { ...pack, name };
      } catch (error) {
        await storage.delete(name);
        if (error.name === 'QuotaExceededError')
          throw new Error(
            'Espace insuffisant sur cet appareil. Libérez du stockage puis réessayez.',
            { cause: error },
          );
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    };
    try {
      return locks
        ? await locks.request('premeyzel-offline-download', { ifAvailable: true }, (lock) => {
            if (!lock)
              throw new Error('Un téléchargement est déjà en cours dans une autre fenêtre.');
            return run();
          })
        : await run();
    } finally {
      busy = false;
    }
  }
  return { list, save, remove };
}
export const offlineTrails = createOfflineStore();
