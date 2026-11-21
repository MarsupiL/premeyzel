import { createLocationTracker } from './trail-location.js';
import { createPolygonEditor } from './polygon-editor.js';
import { zonePhase, zoneCountdown } from './hunting-state.js';
import { tileURL, MIN_OFFLINE_ZOOM, MAX_OFFLINE_ZOOM } from './trail-offline.js';

export function createTrailMap(
  container,
  { trails = [], selectedId, onSelect = () => {}, tracking = false } = {},
) {
  container.classList.toggle('tracking-map', tracking);
  const L = globalThis.L;
  if (!L) {
    container.textContent = 'La carte est indisponible. Vous pouvez toujours télécharger le GPX.';
    return {
      destroy() {},
      setTrails() {},
      fit() {},
      toggleTracking() {},
      setHuntingZones() {},
      focusZone() {},
      setOfflinePack() {},
      editPolygon() {
        return null;
      },
    };
  }
  const map = L.map(container, {
    zoomControl: false,
    scrollWheelZoom: false,
    // Dialogs can close mid-zoom; avoid a delayed animation touching a removed map.
    zoomAnimation: false,
    maxZoom: 18,
    minZoom: 6,
  }).setView([45.686, 5.647], 13);
  L.control
    .zoom({
      position: 'topright',
      zoomInTitle: 'Agrandir la carte',
      zoomOutTitle: 'Réduire la carte',
    })
    .addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>',
  );
  const base = L.tileLayer(tileURL(0), {
    crossOrigin: 'anonymous',
    maxNativeZoom: 19,
    maxZoom: 18,
    attribution:
      '<a href="https://cartes.gouv.fr" target="_blank" rel="noopener">© IGN · Géoplateforme</a>',
  }).addTo(map);
  const contours = L.tileLayer(tileURL(1), {
    crossOrigin: 'anonymous',
    minZoom: 6,
    maxNativeZoom: 18,
    maxZoom: 18,
    opacity: 0.72,
  }).addTo(map);
  map.createPane('hunting');
  map.getPane('hunting').style.zIndex = '390';
  const huntingLayers = L.featureGroup().addTo(map),
    zoneLayers = new Map();
  let zoneSignature = '',
    editor = null;
  const huntingNote = document.createElement('div');
  huntingNote.className = 'hunting-map-note';
  huntingNote.hidden = true;
  container.append(huntingNote);
  L.DomEvent.disableClickPropagation(huntingNote);
  function setHuntingZones(zones, now, stale, onZone) {
    const visible = zones.filter((z) => zonePhase(z, now) !== 'expired');
    const signature = visible.map((z) => `${z.id}:${z.revision}:${zonePhase(z, now)}`).join('|');
    huntingNote.hidden = false;
    huntingNote.classList.toggle('stale', stale);
    const active = visible.filter((z) => zonePhase(z, now) === 'active').length;
    huntingNote.textContent = stale
      ? 'Chasse : informations non actualisées'
      : `${active} zone${active > 1 ? 's' : ''} de chasse en cours${visible.length > active ? ` · ${visible.length - active} prévue(s)` : ''}`;
    if (signature !== zoneSignature) {
      zoneSignature = signature;
      huntingLayers.clearLayers();
      zoneLayers.clear();
      for (const zone of visible) {
        const planned = zonePhase(zone, now) === 'planned';
        const label = document.createElement('span');
        const shape = L.polygon(zone.polygon, {
          pane: 'hunting',
          color: planned ? '#995c0d' : '#bd3324',
          weight: 3,
          fillOpacity: planned ? 0.12 : 0.26,
          dashArray: planned ? '7 6' : null,
        })
          .addTo(huntingLayers)
          .bindTooltip(label);
        shape.on('click', () => onZone?.(zone.id));
        zoneLayers.set(zone.id, { shape, label });
      }
    }
    for (const zone of visible)
      zoneLayers.get(zone.id).label.textContent = `${zone.title} · ${zoneCountdown(zone, now)}`;
  }
  const status = document.createElement('div');
  status.className = 'trail-map-status';
  status.setAttribute('role', 'status');
  const mapStatus = document.createElement('span'),
    positionStatus = document.createElement('span');
  mapStatus.textContent = 'Plan IGN · courbes de niveau';
  status.append(mapStatus, positionStatus);
  container.append(status);
  let offlinePack = null,
    offlineURLs = new Set();
  const mapLabel = () =>
    offlinePack ? 'Plan IGN · copie hors ligne' : 'Plan IGN · courbes de niveau';
  function setOfflinePack(pack) {
    if (offlinePack?.name === pack?.name) return;
    offlinePack = pack;
    offlineURLs = new Set(pack?.urls || []);
    // Overzoom downloaded tiles instead of asking for missing zooms 17/18.
    base.options.maxNativeZoom = pack ? MAX_OFFLINE_ZOOM : 19;
    contours.options.maxNativeZoom = pack ? MAX_OFFLINE_ZOOM : 18;
    map.setMinZoom(pack ? MIN_OFFLINE_ZOOM : 6);
    mapStatus.textContent = mapLabel();
    updateCoverage();
  }
  function updateCoverage() {
    // Do not request unsaved tiles beyond the pack's extent while offline.
    const bounds =
      !navigator.onLine && offlinePack ? L.latLngBounds(offlinePack.bounds) : undefined;
    base.options.bounds = contours.options.bounds = bounds;
    base.redraw();
    contours.redraw();
    mapStatus.textContent = mapLabel();
  }
  window.addEventListener('offline', updateCoverage);
  window.addEventListener('online', updateCoverage);
  let errors = 0,
    loads = 0;
  const tileError = (event) => {
    if (offlinePack && !navigator.onLine && !offlineURLs.has(event.tile?.src)) return;
    if (++errors > 2)
      mapStatus.textContent = offlinePack
        ? 'Carte indisponible ici. Hors ligne, restez dans la zone téléchargée.'
        : 'Fond de carte indisponible. Vérifiez votre connexion Internet.';
  };
  base.on('tileerror', tileError);
  contours.on('tileerror', tileError);
  base.on('tileload', () => {
    if (++loads > 2 && !errors) mapStatus.textContent = mapLabel();
  });
  base.on('loading', () => {
    errors = loads = 0;
  });
  map.on('moveend', () => {
    if (
      !navigator.onLine &&
      offlinePack &&
      !L.latLngBounds(offlinePack.bounds).contains(map.getCenter())
    )
      mapStatus.textContent =
        'Hors de la zone téléchargée. Recentrer sur le tracé pour retrouver la carte.';
    else if (!errors) mapStatus.textContent = mapLabel();
  });
  let layers = L.featureGroup().addTo(map),
    selected = null,
    marker = null,
    accuracy = null,
    follow = true,
    lastPosition = null;
  function fit() {
    if (selected?.getBounds().isValid())
      map.fitBounds(selected.getBounds(), {
        paddingTopLeft: [25, 25],
        paddingBottomRight: [
          25,
          container.classList.contains('gpx-preview') ? 55 : tracking ? 170 : 120,
        ],
        maxZoom: 15,
      });
    else if (layers.getBounds().isValid())
      map.fitBounds(layers.getBounds(), {
        paddingTopLeft: [25, 25],
        paddingBottomRight: [
          25,
          container.classList.contains('gpx-preview') ? 55 : tracking ? 170 : 120,
        ],
        maxZoom: 15,
      });
  }
  function setTrails(next, selection, fitRoute = true) {
    layers.clearLayers();
    selected = null;
    // Draw the selected route last so it stays visible where routes overlap.
    const ordered = [...next].sort(
      (a, b) => Number(a.id === selection) - Number(b.id === selection),
    );
    for (const trail of ordered) {
      if (!trail.track?.segments?.length) continue;
      const active = trail.id === selection;
      const color = active ? '#d000a8' : '#6d28d9';
      // A white casing separates the route from contour lines and wooded areas.
      L.polyline(trail.track.segments, {
        color: '#fff',
        weight: active ? 10 : 7,
        opacity: 1,
        interactive: false,
      }).addTo(layers);
      const line = L.polyline(trail.track.segments, {
        color,
        weight: active ? 6 : 4,
        opacity: 1,
      }).addTo(layers);
      line.on('click', () => onSelect(trail.id));
      if (active) {
        selected = line;
        const first = trail.track.segments[0][0],
          last = trail.track.segments.at(-1).at(-1);
        L.circleMarker(first, {
          radius: 6,
          color,
          weight: 3,
          fillColor: '#fff',
          fillOpacity: 1,
        })
          .bindTooltip('Départ')
          .addTo(layers);
        L.circleMarker(last, {
          radius: 6,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindTooltip('Arrivée')
          .addTo(layers);
        for (const w of trail.track.waypoints || []) {
          const label = document.createElement('span');
          label.textContent = w.name;
          L.circleMarker(w.point, { radius: 4, color: '#806b32' }).bindTooltip(label).addTo(layers);
        }
      }
    }
    if (fitRoute) fit();
  }
  const locate = document.createElement('button');
  locate.className = 'btn secondary';
  locate.type = 'button';
  locate.textContent = 'Ma position';
  locate.setAttribute('aria-pressed', 'false');
  const centre = document.createElement('button');
  centre.className = 'btn secondary';
  centre.type = 'button';
  centre.textContent = 'Recentrer sur le tracé';
  centre.onclick = fit;
  const followButton = document.createElement('button');
  followButton.className = 'btn secondary';
  followButton.type = 'button';
  followButton.textContent = 'Suivre ma position';
  followButton.hidden = true;
  followButton.setAttribute('aria-pressed', 'true');
  followButton.onclick = () => {
    follow = !follow;
    followButton.setAttribute('aria-pressed', String(follow));
    if (follow && lastPosition) map.panTo([lastPosition.lat, lastPosition.lon]);
  };
  const toolbar = document.createElement('div');
  toolbar.className = 'trail-map-toolbar';
  toolbar.append(centre);
  if (tracking) toolbar.append(locate, followButton);
  container.append(toolbar);
  L.DomEvent.disableClickPropagation(toolbar);
  L.DomEvent.disableScrollPropagation(toolbar);
  L.DomEvent.disableClickPropagation(status);
  const tracker = createLocationTracker({
    onPosition: (p) => {
      lastPosition = p;
      const latLng = [p.lat, p.lon];
      if (!marker) {
        marker = L.circleMarker(latLng, {
          radius: 7,
          color: '#fff',
          weight: 3,
          fillColor: '#266cbd',
          fillOpacity: 1,
        }).addTo(map);
        accuracy = L.circle(latLng, {
          radius: p.accuracy,
          color: '#266cbd',
          weight: 1,
          fillOpacity: 0.1,
        }).addTo(map);
      } else {
        marker.setLatLng(latLng);
        accuracy.setLatLng(latLng).setRadius(p.accuracy);
        marker.setStyle({ fillColor: '#266cbd' });
      }
      if (follow) map.panTo(latLng);
    },
    onStatus: (s) => {
      positionStatus.textContent = s.message;
      locate.textContent = s.active ? 'Arrêter le suivi' : 'Ma position';
      locate.setAttribute('aria-pressed', String(s.active));
      followButton.hidden = !s.active;
      if (s.stale || !s.active) marker?.setStyle({ fillColor: '#777' });
    },
  });
  locate.onclick = () => {
    if (tracker.active) tracker.stop();
    else {
      follow = true;
      followButton.setAttribute('aria-pressed', 'true');
      tracker.start();
    }
  };
  map.on('dragstart', () => {
    follow = false;
    followButton.setAttribute('aria-pressed', 'false');
  });
  const staleTimer = setInterval(() => tracker.checkStale(), 10000);
  const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  observer.observe(container);
  setTrails(trails, selectedId);
  return {
    setTrails,
    setOfflinePack,
    setHuntingZones,
    focusZone(id) {
      const layer = zoneLayers.get(id)?.shape;
      if (layer) map.fitBounds(layer.getBounds(), { padding: [35, 70], maxZoom: 16 });
    },
    editPolygon(options) {
      editor?.destroy();
      editor = createPolygonEditor(map, options);
      return editor;
    },
    fit,
    toggleTracking: () => locate.click(),
    destroy() {
      editor?.destroy();
      tracker.stop();
      clearInterval(staleTimer);
      observer.disconnect();
      window.removeEventListener('offline', updateCoverage);
      window.removeEventListener('online', updateCoverage);
      map.remove();
    },
  };
}
