import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../start.js', import.meta.url), 'utf8')).replace(
  "import('./resident-app.js')",
  'launch()',
);

async function startup({ firstInstall = false, update = false, claim = true, fail = false } = {}) {
  const oldWorker = { state: 'activated' },
    nextWorker = new EventTarget(),
    serviceWorker = new EventTarget();
  let launches = 0,
    reloads = 0;
  serviceWorker.controller = firstInstall ? null : oldWorker;
  const registration = {
    active: firstInstall ? null : oldWorker,
    async update() {
      if (fail) throw new Error('Offline');
      if (!update) return;
      registration.installing = nextWorker;
      nextWorker.state = 'installing';
      setImmediate(() => {
        registration.active = nextWorker;
        nextWorker.state = 'activated';
        if (claim) {
          serviceWorker.controller = nextWorker;
          serviceWorker.dispatchEvent(new Event('controllerchange'));
        }
        nextWorker.dispatchEvent(new Event('statechange'));
      });
    },
  };
  serviceWorker.register = async () => registration;
  const run = () =>
    vm.runInNewContext(`(async () => {${source}\n})()`, {
      navigator: { serviceWorker },
      location: { reload: () => reloads++ },
      launch: () => launches++,
      setTimeout,
      clearTimeout,
    });
  await run();
  return {
    serviceWorker,
    registration,
    run,
    counts: () => ({ launches, reloads }),
  };
}

test('an installed-app update reloads the document before launching new modules with old styles', async () => {
  const app = await startup({ update: true });
  assert.deepEqual(app.counts(), { launches: 0, reloads: 1 });
  // The replacement page already has the current worker: do not loop on reload.
  app.registration.installing = null;
  app.registration.update = async () => {};
  await app.run();
  assert.deepEqual(app.counts(), { launches: 1, reloads: 1 });
});

test('activation before controller claim still reloads the old document', async () => {
  const app = await startup({ update: true, claim: false });
  assert.deepEqual(app.counts(), { launches: 0, reloads: 1 });
});

test('first installation uses its fresh network styles without a reload', async () => {
  const app = await startup({ firstInstall: true, update: true });
  assert.deepEqual(app.counts(), { launches: 1, reloads: 0 });
});

test('a current or offline app starts normally and later worker changes do not discard an open form', async () => {
  for (const fail of [false, true]) {
    const app = await startup({ fail });
    assert.deepEqual(app.counts(), { launches: 1, reloads: 0 });
    app.serviceWorker.controller = { state: 'activated' };
    app.serviceWorker.dispatchEvent(new Event('controllerchange'));
    assert.deepEqual(app.counts(), { launches: 1, reloads: 0 });
  }
});

test('browsers without service workers can still open the app', async () => {
  let launches = 0;
  await vm.runInNewContext(`(async () => {${source}\n})()`, {
    navigator: {},
    launch: () => launches++,
  });
  assert.equal(launches, 1);
});
