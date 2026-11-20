// No position is sent to the route API. The caller owns the watch's lifetime.
export function createLocationTracker({
  geolocation = globalThis.navigator?.geolocation,
  onPosition,
  onStatus,
  now = Date.now,
}) {
  let watch = null,
    lastTime = 0,
    generation = 0,
    active = false;
  function stop(message = 'Localisation arrêtée.') {
    generation++;
    active = false;
    if (watch !== null) geolocation?.clearWatch(watch);
    watch = null;
    lastTime = 0;
    onStatus({ active: false, message });
  }
  function start() {
    if (active) return;
    if (!geolocation) {
      onStatus({
        active: false,
        message: 'La localisation n’est pas disponible dans ce navigateur.',
      });
      return;
    }
    active = true;
    const current = ++generation;
    onStatus({ active: true, message: 'Recherche de votre position…' });
    try {
      const id = geolocation.watchPosition(
        (position) => {
          if (current !== generation || !active) return;
          const c = position.coords;
          if (
            !Number.isFinite(c.latitude) ||
            Math.abs(c.latitude) > 90 ||
            !Number.isFinite(c.longitude) ||
            Math.abs(c.longitude) > 180 ||
            !Number.isFinite(c.accuracy) ||
            c.accuracy < 0
          )
            return;
          lastTime = position.timestamp || now();
          if (now() - lastTime > 30000) {
            onStatus({
              active: true,
              stale: true,
              message: 'Position ancienne. En attente d’un nouveau signal GPS…',
            });
            return;
          }
          onPosition({
            lat: c.latitude,
            lon: c.longitude,
            accuracy: c.accuracy,
            timestamp: lastTime,
          });
          onStatus({
            active: true,
            message: `Position actuelle · précision ±${Math.round(c.accuracy)} m`,
          });
        },
        (error) => {
          if (current !== generation || !active) return;
          if (error.code === 1)
            stop(
              'Localisation refusée. Autorisez-la dans les réglages du navigateur pour réessayer.',
            );
          else
            onStatus({
              active: true,
              stale: true,
              message:
                error.code === 3
                  ? 'Signal GPS trop lent. Recherche en cours…'
                  : 'Position indisponible. Recherche en cours…',
            });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
      if (current === generation && active) watch = id;
      else geolocation.clearWatch(id);
    } catch {
      stop('La localisation n’est pas disponible dans ce navigateur.');
    }
  }
  return {
    start,
    stop,
    get active() {
      return active;
    },
    checkStale() {
      if (active && lastTime && now() - lastTime > 30000)
        onStatus({
          active: true,
          stale: true,
          message: 'Dernière position connue · signal GPS ancien.',
        });
    },
  };
}
