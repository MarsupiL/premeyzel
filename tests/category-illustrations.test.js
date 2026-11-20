import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { defaultArt, photoSource } from '../photos.js';
import { cardArt } from '../art.js';
import { escapeHTML as esc } from '../html.js';

const source = readFileSync(new URL('../resident-app.js', import.meta.url), 'utf8');
const changeSource = source.slice(
  source.indexOf("document.addEventListener('change',"),
  source.indexOf("document.addEventListener('input',"),
);
const visualSource = source.slice(
  source.indexOf('function visual('),
  source.indexOf('async function loadPhotos('),
);
const removeSource = source.slice(
  source.indexOf("    if (action === 'remove-photo'"),
  source.indexOf("    if (action === 'install')"),
);

test('every published category has a distinct illustration and unknown values keep a safe fallback', () => {
  const drawings = [];
  // Read the actual form options so a newly added category cannot silently use
  // a generic fallback without this coverage being updated.
  for (const [kind, name] of [
    ['events', 'EVENT_CATEGORIES'],
    ['ads', 'AD_CATEGORIES'],
  ]) {
    const categories = vm.runInNewContext(
      source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))[1],
    );
    for (const category of categories) {
      const art = defaultArt(kind, category);
      assert.notEqual(art, defaultArt(kind), category);
      const svg = cardArt(art);
      assert.match(svg, /^<svg viewBox="0 0 400 220"/);
      assert.doesNotMatch(svg, /undefined|<script|<image|<text/);
      drawings.push(svg);
    }
  }
  assert.equal(drawings.length, 13);
  assert.equal(new Set(drawings).size, 13);
  for (const category of [undefined, 'Unknown', '__proto__', 'constructor']) {
    assert.equal(defaultArt('events', category), 'table');
    assert.equal(defaultArt('ads', category), 'plant');
  }
  assert.equal(defaultArt('trails', 'Sport'), 'forest');
  assert.equal(defaultArt('trips', 'À louer'), 'campervan');
});

function fixture(photo = null) {
  let change;
  const elements = new Map();
  const $ = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '' });
    return elements.get(selector);
  };
  class Select {
    constructor(value) {
      this.value = value;
      this.name = 'category';
      this.form = { id: 'post-form' };
      this.parentElement = { querySelector: () => null };
    }
    closest() {
      return null;
    }
  }
  const context = vm.createContext({
    document: {
      addEventListener: (_event, listener) => {
        change = listener;
      },
    },
    HTMLSelectElement: Select,
    $,
    esc,
    defaultArt,
    cardArt,
    photoSource,
    API_BASE: 'https://village.example',
  });
  vm.runInContext(
    `let draft={kind:'ads',category:'À donner',photo:${JSON.stringify(photo)},request:0,busy:false};\n` +
      visualSource +
      '\n' +
      changeSource,
    context,
  );
  return {
    context,
    preview: () => $('#photo-preview').innerHTML,
    change: (value) => change({ target: new Select(value) }),
    remove() {
      vm.runInContext(`{const action='remove-photo',b={};${removeSource}}`, context);
    },
  };
}

test('changing category updates the default preview, including after a photo is removed', async () => {
  const f = fixture();
  await f.change('À louer');
  assert.equal(
    f.preview(),
    `<span class="post-visual">${cardArt(defaultArt('ads', 'À louer'))}</span>`,
  );
  await f.change('Perdu / trouvé');
  assert.ok(f.preview().includes(cardArt(defaultArt('ads', 'Perdu / trouvé'))));
});

test('category changes preserve uploaded, stored and pilot photos; removal uses the latest category', async () => {
  for (const photo of [
    'data:image/jpeg;base64,/9j/AAAA',
    'sample:eggs',
    'https://village.example/api/posts/example/photo',
  ]) {
    const f = fixture(photo);
    await f.change('Services');
    assert.equal(f.preview(), '', 'the existing photo node is left untouched');
    assert.equal(vm.runInContext('draft.photo', f.context), photo);
    const visual = vm.runInContext('visual(draft, draft.kind)', f.context);
    assert.match(visual, /class="post-photo"/);
    assert.ok(
      visual.includes(cardArt(defaultArt('ads', 'Services'))),
      'the matching fallback remains under the photo',
    );
    f.remove();
    assert.equal(vm.runInContext('draft.photo', f.context), null);
    assert.equal(
      f.preview(),
      `<span class="post-visual">${cardArt(defaultArt('ads', 'Services'))}</span>`,
    );
  }
});
