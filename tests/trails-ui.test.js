import { escapeHTML as esc } from '../html.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { defaultArt, photoSource } from '../photos.js';
import { cardArt } from '../art.js';
const source = readFileSync(new URL('../trails-ui.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replaceAll('export ', '');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test('saved full tracks open without an API call offline and remain a fallback when reception fails', async () => {
  let calls = 0;
  const context = vm.createContext({
    navigator: { onLine: false },
    fetchTrail: async () => {
      calls++;
      throw new TypeError('Network unavailable');
    },
  });
  vm.runInContext(
    source +
      `
    savedPacks = [{ trail: { id: 'saved', revision: 1, track: { segments: [[[45, 5], [46, 6]]] }, canManage: false } }];
    items = [{id:'saved',preview:true}];
    this.fullTrail=fullTrail;
  `,
    context,
  );
  assert.equal((await context.fullTrail('saved')).canManage, false);
  assert.equal(calls, 0);
  context.navigator.onLine = true;
  assert.equal((await context.fullTrail('saved')).track.segments.length, 1);
  assert.equal(calls, 1);
  await assert.rejects(context.fullTrail('not-saved'), /Network unavailable/);
});
test('trail thumbnails follow activity, replace pilot placeholders and retain real photos', () => {
  const context = vm.createContext({
    esc,
    defaultArt,
    cardArt,
    photoSource,
    TRAIL_API: 'https://village.example',
  });
  vm.runInContext(source + '\nthis.visual=visual;', context);
  const hiking = context.visual({ activity: 'Marche' });
  const cycling = context.visual({ activity: 'VTT' });
  assert.notEqual(hiking, cycling);
  assert.ok(hiking.includes(cardArt('trail-hiking')));
  assert.ok(cycling.includes(cardArt('trail-cycling')));
  for (const photo of ['sample:forest', 'sample:mountain']) {
    assert.equal(context.visual({ activity: 'Marche', photo }), hiking);
    assert.equal(context.visual({ activity: 'VTT', photo }), cycling);
  }
  for (const photo of [
    'data:image/jpeg;base64,/9j/AAAA',
    'https://village.example/api/trails/example/photo',
  ]) {
    const html = context.visual({ activity: 'VTT', photo });
    assert.match(html, /class="post-photo"/);
    assert.ok(html.includes(`src="${photo}"`));
    assert.ok(html.includes(cardArt('trail-cycling')));
  }
});

test('trail form activity changes and photo removal use the current activity', async () => {
  const nodes = new Map(),
    listeners = {},
    pendingPhoto = deferred();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '' });
    return nodes.get(selector);
  };
  const form = {
    elements: {
      activity: {
        value: 'VTT',
        addEventListener: (name, fn) => {
          listeners[name] = fn;
        },
      },
    },
    querySelector: node,
  };
  const dialogFixture = (_title, html) => {
    node('.photo-preview').innerHTML = html.match(
      /<div class="photo-preview">([\s\S]*?)<\/div>/,
    )[1];
    return {
      isConnected: true,
      closeView() {},
      querySelector: (selector) => (selector === 'form' ? form : node(selector)),
    };
  };
  const context = vm.createContext({
    esc,
    defaultArt,
    cardArt,
    photoSource,
    dialogFixture,
    TRAIL_API: 'https://village.example',
    crypto: globalThis.crypto,
    preparePhoto: () => pendingPhoto.promise,
  });
  vm.runInContext(source + '\ndialog=dialogFixture;this.composeTrail=composeTrail;', context);
  context.composeTrail({ id: 'trail', activity: 'VTT', photo: 'sample:mountain' });
  const preview = () => node('.photo-preview').innerHTML;
  assert.ok(
    preview().includes(cardArt('trail-cycling')),
    'saved cycling route opens with its matching default',
  );
  form.elements.activity.value = 'Marche';
  listeners.change();
  assert.ok(preview().includes(cardArt('trail-hiking')));
  const upload = node('#trail-photo').onchange({ target: { files: [{}] } });
  form.elements.activity.value = 'VTT';
  listeners.change();
  pendingPhoto.resolve('data:image/jpeg;base64,/9j/AAAA');
  await upload;
  assert.match(preview(), /class="post-photo"/);
  assert.ok(preview().includes(cardArt('trail-cycling')));
  const uploaded = preview();
  form.elements.activity.value = 'Marche';
  listeners.change();
  assert.equal(preview(), uploaded, 'switching activity leaves the uploaded photo node intact');
  node('[data-photo-remove]').onclick();
  assert.ok(preview().includes(cardArt('trail-hiking')));
  assert.doesNotMatch(preview(), /class="post-photo"/);
});

test('leaving the trail page discards an outstanding load and does not reopen a map', async () => {
  const pending = deferred(),
    writes = [];
  const context = {
    esc,
    fetchTrail: () => pending.promise,
    fetchTrails: () => pending.promise,
    clearInterval() {},
    localStorage: { setItem: (...args) => writes.push(args) },
    document: {},
    rootFixture: { querySelector: () => ({ textContent: '', className: '' }) },
  };
  vm.createContext(context);
  vm.runInContext(
    source + `\nroot=rootFixture;this.api={openRoute,unmountTrails,details:()=>details.size};`,
    context,
  );
  const open = context.api.openRoute('trail');
  context.api.unmountTrails();
  pending.resolve({ id: 'trail', title: 'Late trail' });
  await open;
  assert.equal(context.api.details(), 0);
  assert.equal(writes.length, 0);
});
