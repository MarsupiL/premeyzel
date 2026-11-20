import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { tripResults, tripDateHelp } from '../trips.js';
import { escapeHTML as esc } from '../html.js';

const source = readFileSync(new URL('../resident-app.js', import.meta.url), 'utf8');
function fixture() {
  const handlers = {},
    nodes = {
      '#trip-date-help': { textContent: '' },
      '#trip-results': { innerHTML: '' },
    };
  let refreshes = 0,
    finish;
  const input = {
    id: 'trip-date-filter',
    value: '',
    focus() {
      throw new Error('Forced picker focus');
    },
  };
  nodes['#trip-date-filter'] = input;
  const document = {
    activeElement: input,
    addEventListener: (name, callback) => {
      handlers[name] = callback;
    },
  };
  const context = vm.createContext({
    document,
    $: (selector) => nodes[selector],
    tripResults,
    tripDateHelp,
    esc,
    route: () => 'trajets',
    authFormBusy: () => false,
    // A full render starts by unmounting the current page; it must not run while editing.
    unmountTrails: () => {
      throw new Error('Full page render');
    },
    refreshData: async () => {
      refreshes++;
      await new Promise((resolve) => {
        finish = resolve;
      });
      vm.runInContext('filteredTripDate=tripDate; render();', context);
    },
  });
  vm.runInContext(
    "let user={id:'alice'},renderedAccount='alice',trips=[],filteredTrips=[],tripDate='',filteredTripDate='',query='',filter='Tout',loading=false,loadError='';\n" +
      source.slice(source.indexOf('function currentTripView('), source.indexOf('function page(')) +
      source.slice(
        source.indexOf("document.addEventListener('change',"),
        source.indexOf("document.addEventListener('input',"),
      ) +
      source.slice(
        source.indexOf("document.addEventListener('input',"),
        source.indexOf("document.addEventListener(\n  'pointerdown'"),
      ) +
      '\nthis.api={render,state:()=>({tripDate,filteredTripDate}),setUser:(value)=>{user=value;},error:(value)=>{loadError=value;}};',
    context,
  );
  return {
    input,
    document,
    nodes,
    handlers,
    api: context.api,
    finish: () => finish(),
    refreshes: () => refreshes,
  };
}

test('date input changes preserve the native field and focus through loading and completion', async () => {
  const f = fixture();
  f.input.value = '2099-12-11';
  const pending = f.handlers.change({ target: f.input });
  assert.equal(f.api.state().tripDate, '2099-12-11');
  assert.match(f.nodes['#trip-results'].innerHTML, /Chargement des trajets/);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.refreshes(), 1);
  f.finish();
  await pending;
  assert.match(f.nodes['#trip-results'].innerHTML, /11 décembre 2099/);
  assert.equal(f.nodes['#trip-date-filter'], f.input);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.input.value, '2099-12-11');
});

test('uncommitted date input and an in-flight background render do not apply or replace it', () => {
  const f = fixture();
  f.input.value = '2099-12-11';
  f.handlers.input({ target: f.input });
  f.api.render();
  assert.equal(f.api.state().tripDate, '');
  assert.equal(f.refreshes(), 0);
  assert.equal(f.input.value, '2099-12-11');
  assert.equal(f.document.activeElement, f.input);
});

test('request errors remain visible without interrupting the picker; closing or switching accounts releases it', () => {
  const f = fixture();
  f.api.error('Réseau <indisponible>');
  f.api.render();
  assert.match(f.nodes['#trip-results'].innerHTML, /Réseau &lt;indisponible&gt;/);
  assert.match(f.nodes['#trip-results'].innerHTML, /Réessayer/);
  f.document.activeElement = null;
  assert.throws(() => f.api.render(), /Full page render/);
  f.document.activeElement = f.input;
  f.api.setUser({ id: 'bob' });
  assert.throws(() => f.api.render(), /Full page render/);
  f.api.setUser(null);
  assert.throws(() => f.api.render(), /Full page render/);
});
