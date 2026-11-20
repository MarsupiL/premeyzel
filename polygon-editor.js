// The editor uses the existing Leaflet instance; no second mapping library is loaded.
export function createPolygonEditor(map, { polygon = [], onChange = () => {} } = {}) {
  const L = globalThis.L,
    layer = L.featureGroup().addTo(map);
  let points = polygon.map((p) => [...p]),
    closed = points.length >= 3;
  const copy = () => points.map((p) => [...p]);
  const emit = () => onChange({ points: copy(), closed });
  function paint() {
    layer.clearLayers();
    if (points.length > 1)
      (closed ? L.polygon : L.polyline)(points, {
        color: '#b43826',
        weight: 3,
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(layer);
    points.forEach((point, i) => {
      const marker = L.marker(point, {
        draggable: true,
        keyboard: true,
        title:
          i === 0 && !closed
            ? 'Fermer la zone sur le premier point'
            : `Point ${i + 1} — déplacer pour ajuster`,
        icon: L.divIcon({
          className: 'hunting-vertex',
          html: `<span>${i + 1}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(layer);
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        if (i === 0 && !closed && points.length >= 3) {
          closed = true;
          paint();
          emit();
        }
      });
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        points[i] = [p.lat, p.lng];
        paint();
        emit();
      });
    });
  }
  function add(point) {
    if (closed || points.length >= 200) return;
    points.push(point);
    paint();
    emit();
  }
  const click = (event) => add([event.latlng.lat, event.latlng.lng]);
  map.on('click', click);
  map.doubleClickZoom.disable();
  paint();
  if (points.length >= 3) map.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 16 });
  emit();
  return {
    finish() {
      if (points.length >= 3) {
        closed = true;
        paint();
        emit();
      }
    },
    undo() {
      closed = false;
      points.pop();
      paint();
      emit();
    },
    reset() {
      closed = false;
      points = [];
      paint();
      emit();
    },
    addCentre() {
      const p = map.getCenter();
      add([p.lat, p.lng]);
    },
    destroy() {
      map.off('click', click);
      layer.remove();
    },
  };
}
