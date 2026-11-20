import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolygonEditor } from '../polygon-editor.js';

test('polygon editing closes without extra vertices, drags corners, undoes, resets and removes its click listener', (t) => {
  let handlers = {},
    markers = [],
    latest,
    removed = false;
  const group = {
    addTo() {
      return this;
    },
    clearLayers() {
      markers = [];
    },
    remove() {
      removed = true;
    },
    getBounds() {
      return {};
    },
  };
  const shape = () => ({
    addTo() {
      return this;
    },
  });
  const previous = globalThis.L;
  t.after(() => {
    if (previous === undefined) delete globalThis.L;
    else globalThis.L = previous;
  });
  globalThis.L = {
    featureGroup: () => group,
    polygon: shape,
    polyline: shape,
    divIcon: (v) => v,
    marker: (p) => {
      const marker = {
        point: p,
        handlers: {},
        addTo() {
          markers.push(this);
          return this;
        },
        on(event, fn) {
          this.handlers[event] = fn;
          return this;
        },
        getLatLng() {
          return { lat: this.point[0], lng: this.point[1] };
        },
      };
      return marker;
    },
    DomEvent: { stopPropagation() {} },
  };
  const map = {
    on(e, f) {
      handlers[e] = f;
    },
    off(e) {
      delete handlers[e];
    },
    fitBounds() {},
    doubleClickZoom: { disable() {} },
    getCenter() {
      return { lat: 45.68, lng: 5.64 };
    },
  };
  const editor = createPolygonEditor(map, { onChange: (s) => (latest = s) });
  const click = (lat, lng) => handlers.click({ latlng: { lat, lng } });
  click(45.68, 5.64);
  click(45.69, 5.64);
  click(45.69, 5.65);
  markers[0].handlers.click({});
  assert.equal(latest.closed, true);
  click(45.7, 5.65);
  assert.equal(latest.points.length, 3);
  markers[1].point = [45.7, 5.64];
  markers[1].handlers.dragend();
  assert.deepEqual(latest.points[1], [45.7, 5.64]);
  editor.undo();
  assert.equal(latest.closed, false);
  assert.equal(latest.points.length, 2);
  editor.reset();
  assert.equal(latest.points.length, 0);
  editor.addCentre();
  assert.deepEqual(latest.points, [[45.68, 5.64]]);
  editor.finish();
  assert.equal(latest.closed, false);
  editor.destroy();
  assert.equal(removed, true);
  assert.equal(handlers.click, undefined);
});
