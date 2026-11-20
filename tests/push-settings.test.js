import { escapeHTML as esc } from '../html.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../push-ui.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/^let owner/m, 'const request=apiRequest;\nlet owner')
  .replaceAll('import.meta.url', "'https://marsupil.github.io/premeyzel/push-ui.js'")
  .replaceAll('export ', '');
function fixture({
  saved = {},
  subscribed = false,
  permission = 'default',
  pushSupported = true,
} = {}) {
  let stored = saved,
    sub = subscribed ? subscription() : null,
    unsubscribed = 0,
    requested = 0;
  const calls = [],
    badges = [],
    events = {},
    section = { innerHTML: '' };
  function subscription() {
    return {
      endpoint: 'https://fcm.googleapis.com/test',
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'test', auth: 'test' } };
      },
      async unsubscribe() {
        unsubscribed++;
        sub = null;
        return true;
      },
    };
  }
  const reg = {
    pushManager: {
      async getSubscription() {
        return sub;
      },
      async subscribe() {
        sub = subscription();
        return sub;
      },
    },
    async getNotifications() {
      return [];
    },
  };
  if (!pushSupported) {
    delete reg.pushManager;
    delete reg.getNotifications;
  }
  const caches = {
    async open() {
      return {
        async match() {
          return new Response(JSON.stringify(stored));
        },
        async put(url, response) {
          stored = await response.json();
        },
      };
    },
  };
  const Notification = {
    permission,
    requestPermission() {
      requested++;
      this.permission = 'granted';
      return Promise.resolve('granted');
    },
  };
  const context = {
    esc,
    apiRequest: async (path, options) => {
      calls.push({ path, options });
      if (path === 'push/config') return { enabled: true, publicKey: 'AQID' };
      if (path === 'push/status') return { subscribed: true };
      return { ok: true };
    },
    navigator: {
      async setAppBadge(count) {
        badges.push(count);
      },
      async clearAppBadge() {
        badges.push(0);
      },
      userAgent: 'Chrome',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      serviceWorker: {
        async register() {
          return reg;
        },
        ready: Promise.resolve(reg),
      },
    },
    document: {
      hidden: false,
      querySelectorAll: () => [section],
      addEventListener: (n, fn) => (events[n] = fn),
    },
    caches,
    Notification,
    PushManager: {},
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    URL,
    Response,
    Uint8Array,
    atob,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  if (!pushSupported) delete context.PushManager;
  vm.createContext(context);
  vm.runInContext(
    source + '\nthis.pushAPI={syncPushAccount,disconnectPush,enable,updateAppBadge};',
    context,
  );
  return {
    api: context.pushAPI,
    calls,
    badges,
    events,
    section,
    get stored() {
      return stored;
    },
    get requested() {
      return requested;
    },
    get unsubscribed() {
      return unsubscribed;
    },
    get sub() {
      return sub;
    },
  };
}
test('notifications never prompt on account load, and enable only after an explicit click', async () => {
  const f = fixture();
  await f.api.syncPushAccount({ id: 'alice' });
  assert.equal(f.requested, 0);
  assert.equal(f.sub, null);
  assert.match(f.section.innerHTML, /Activer les notifications/);
  f.events.click({ target: { closest: () => ({ dataset: { pushAction: 'enable' } }) } });
  assert.equal(f.requested, 1);
  for (let n = 0; n < 20; n++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.stored.owner, 'alice');
  assert.equal(f.stored.enabled, true);
  assert.ok(f.calls.some((c) => c.path === 'push/subscription' && c.options.method === 'PUT'));
  assert.match(f.section.innerHTML, /Activées sur cet appareil/);
});
test('enabled notification settings offer only the device opt-out', async () => {
  const f = fixture({
    saved: { owner: 'alice', enabled: true },
    subscribed: true,
    permission: 'granted',
  });
  await f.api.syncPushAccount({ id: 'alice' });
  assert.match(f.section.innerHTML, /Activées sur cet appareil/);
  assert.match(f.section.innerHTML, /Désactiver sur cet appareil/);
  assert.doesNotMatch(f.section.innerHTML, /Tester les notifications|data-push-action="test"/);
  f.events.click({ target: { closest: () => ({ dataset: { pushAction: 'disable' } }) } });
  for (let n = 0; n < 20; n++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.unsubscribed, 1);
  assert.equal(f.requested, 0);
  assert.match(f.section.innerHTML, /Activer les notifications/);
  assert.ok(f.calls.some((c) => c.path === 'push/subscription' && c.options.method === 'DELETE'));
  assert.ok(f.calls.every((c) => c.path !== 'push/test'));
});
test('unread badges update and logout clears them without prompting', async () => {
  const f = fixture();
  await f.api.updateAppBadge(4);
  await f.api.updateAppBadge(-1);
  await f.api.updateAppBadge(NaN);
  await f.api.disconnectPush(true);
  assert.deepEqual(f.badges, [4, 0]);
  assert.equal(f.requested, 0);
});
test('logout removes delivery registration and account changes never inherit the old opt-in', async () => {
  const f = fixture({
    saved: { owner: 'alice', enabled: true },
    subscribed: true,
    permission: 'granted',
  });
  await f.api.syncPushAccount({ id: 'alice' });
  await f.api.disconnectPush(true);
  assert.equal(f.unsubscribed, 1);
  assert.deepEqual(f.stored, {});
  assert.ok(f.calls.some((c) => c.options?.method === 'DELETE'));
  await f.api.syncPushAccount({ id: 'bob' });
  assert.equal(f.sub, null);
  assert.equal(f.requested, 0);
  const switched = fixture({
    saved: { owner: 'alice', enabled: true },
    subscribed: true,
    permission: 'granted',
  });
  await switched.api.syncPushAccount({ id: 'bob' });
  assert.equal(switched.unsubscribed, 1);
  assert.equal(switched.stored.enabled, undefined);
  assert.equal(switched.requested, 0);
});
test('an expired subscription is repaired on a visit only for the same opted-in account', async () => {
  const f = fixture({ saved: { owner: 'alice', enabled: true }, permission: 'granted' });
  await f.api.syncPushAccount({ id: 'alice' });
  assert.ok(f.sub);
  assert.equal(f.requested, 0);
  assert.ok(f.calls.some((c) => c.path === 'push/subscription' && c.options.method === 'PUT'));
  const denied = fixture({ saved: { owner: 'alice', enabled: true }, permission: 'denied' });
  await denied.api.syncPushAccount({ id: 'alice' });
  assert.equal(denied.sub, null);
  assert.equal(denied.requested, 0);
  assert.match(denied.section.innerHTML, /notifications sont bloquées/);
});
test('browsers without Push API can still sign out normally', async () => {
  const f = fixture({ pushSupported: false });
  await f.api.syncPushAccount({ id: 'alice' });
  assert.match(f.section.innerHTML, /pas disponibles dans ce navigateur/);
  await f.api.disconnectPush(true);
  assert.equal(f.sub, null);
});
