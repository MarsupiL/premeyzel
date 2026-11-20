import { escapeHTML as esc } from '../html.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
