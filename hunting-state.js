import { request } from './api-client.js';

export function zonePhase(zone, now) {
  return zone.endsAt <= now ? 'expired' : zone.startsAt > now ? 'planned' : 'active';
}
export function zoneCountdown(zone, now) {
  const phase = zonePhase(zone, now);
  if (phase === 'expired') return 'Terminée';
  const minutes = Math.max(
    1,
    Math.ceil(((phase === 'planned' ? zone.startsAt : zone.endsAt) - now) / 60000),
  );
  const duration =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
      : `${minutes} min`;
  return phase === 'planned' ? `Début dans ${duration}` : `Encore ${duration}`;
}

// Short-lived, in-memory feed: never claim an offline cache is a current safety report.
export function createHuntingFeed({
  onChange = () => {},
  fetchPage = request,
  clock = () => performance.now(),
} = {}) {
  let zones = [],
    anchor = Date.now(),
    tickAt = clock(),
    checkedAt = null,
    failed = false,
    destroyed = false,
    pending = null;
  const controller = new AbortController();
  const now = () => anchor + clock() - tickAt;
  const snapshot = () => ({
    zones: zones
      .filter((z) => zonePhase(z, now()) !== 'expired')
      .sort((a, b) => a.startsAt - b.startsAt),
    now: now(),
    stale: failed || checkedAt === null || clock() - checkedAt > 30000,
    loaded: checkedAt !== null,
  });
  const emit = () => {
    if (!destroyed) onChange(snapshot());
  };
  async function load() {
    try {
      const next = [],
        cursors = new Set();
      let cursor = null,
        serverNow,
        receivedAt;
      do {
        const page = await fetchPage(
          'hunting-zones' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''),
          { signal: controller.signal },
        );
        if (destroyed) return;
        if (
          !Array.isArray(page?.zones) ||
          !Number.isSafeInteger(page.serverNow) ||
          (page.nextCursor != null &&
            (typeof page.nextCursor !== 'string' || cursors.has(page.nextCursor)))
        )
          throw new Error('Liste de zones invalide.');
        next.push(...page.zones);
        serverNow = page.serverNow;
        receivedAt = clock();
        cursor = page.nextCursor;
        cursors.add(cursor);
      } while (cursor);
      zones = [...new Map(next.map((z) => [z.id, z])).values()];
      anchor = serverNow;
      tickAt = checkedAt = receivedAt;
      failed = false;
    } catch {
      failed = true;
    }
    emit();
  }
  function refresh(afterWrite = false) {
    if (destroyed) return Promise.resolve();
    if (pending && afterWrite) return pending.then(() => refresh());
    if (!pending)
      pending = load().finally(() => {
        pending = null;
      });
    return pending;
  }
  return {
    snapshot,
    now,
    tick: emit,
    refresh,
    markStale() {
      failed = true;
      emit();
    },
    destroy() {
      destroyed = true;
      controller.abort();
      zones = [];
    },
  };
}
