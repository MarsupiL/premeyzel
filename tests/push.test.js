import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8'),
  id = '41345550-1c65-4aaa-8fbd-ef7eeebc41c1';
function fixture({ storageFailure = false, badgeFailure = false } = {}) {
  const listeners = {},
    shown = [],
    opened = [],
    navigated = [],
    posted = [],
    badges = [],
    scope = 'https://marsupil.github.io/premeyzel/';
  let state = { owner: 'alice', enabled: true },
    windows = [];
  const self = {
    navigator: {
      async setAppBadge(count) {
        if (badgeFailure) throw new Error('Unavailable');
        badges.push(count);
      },
    },
    location: { origin: 'https://marsupil.github.io' },
    registration: {
      scope,
      async showNotification(title, options) {
        shown.push({ title, ...options });
      },
    },
    addEventListener: (name, fn) => (listeners[name] = fn),
    clients: {
      async matchAll() {
        return windows;
      },
      async openWindow(url) {
        opened.push(url);
      },
    },
  };
  const caches = {
    async open() {
      if (storageFailure) throw new Error('Storage unavailable');
      return {
        async match() {
          return new Response(JSON.stringify(state));
        },
      };
    },
  };
  vm.runInNewContext(source, { self, caches, URL, Request, Response });
  const event = async (name, fields) => {
    let pending;
    listeners[name]({ ...fields, waitUntil: (p) => (pending = p) });
    await pending;
  };
  return {
    shown,
    opened,
    navigated,
    posted,
    badges,
    setState: (v) => (state = v),
    setWindows: (v) => (windows = v),
    push: (data) => event('push', { data: { json: () => data } }),
    click: (data) => event('notificationclick', { notification: { data, close() {} } }),
  };
}
test('a closed app displays a generic notification without message text or sender details', async () => {
  const f = fixture();
  await f.push({
    type: 'message',
    conversationId: id,
    recipientId: 'alice',
    body: 'secret text',
    sender: 'Private name',
  });
  assert.equal(f.shown.length, 1);
  assert.match(f.shown[0].body, /message privé/);
  assert.doesNotMatch(JSON.stringify(f.shown), /secret text|Private name/);
  assert.equal(f.shown[0].icon, 'https://marsupil.github.io/premeyzel/assets/icon-192.png');
  await f.click(f.shown[0].data);
  assert.deepEqual(f.opened, ['https://marsupil.github.io/premeyzel/#/messages?c=' + id]);
});
test('declarative payloads display once in legacy workers and update the OS badge', async () => {
  const f = fixture();
  await f.push({
    type: 'message',
    recipientId: 'alice',
    conversationId: id,
    unreadCount: 3,
    web_push: 8030,
    notification: { title: 'untrusted replacement', navigate: 'https://evil.example' },
  });
  assert.equal(f.shown.length, 1);
  assert.equal(f.shown[0].title, 'Prémeyzel · Nouveau message');
  assert.deepEqual(f.badges, [3]);
  const unavailable = fixture({ badgeFailure: true });
  await unavailable.push({
    type: 'message',
    recipientId: 'alice',
    conversationId: id,
    unreadCount: 3,
  });
  assert.equal(unavailable.shown.length, 1);
});
test('test alerts do not change unread badges and open account settings', async () => {
  const f = fixture();
  await f.push({ type: 'test', recipientId: 'alice', web_push: 8030 });
  assert.equal(f.shown.length, 1);
  assert.match(f.shown[0].title, /Test de notification/);
  assert.equal(f.badges.length, 0);
  await f.click(f.shown[0].data);
  assert.deepEqual(f.opened, ['https://marsupil.github.io/premeyzel/#/compte']);
});
test('missing storage leaves the generic declarative fallback to the browser', async () => {
  const f = fixture({ storageFailure: true });
  await f.push({ type: 'message', recipientId: 'alice', conversationId: id, web_push: 8030 });
  assert.equal(f.shown.length, 0);
  assert.equal(f.badges.length, 0);
  await f.click({ type: 'message', recipientId: 'alice', conversationId: id });
  assert.deepEqual(f.opened, ['https://marsupil.github.io/premeyzel/#/messages']);
});
test('queued pushes from a signed-out or different account are ignored', async () => {
  const f = fixture();
  f.setState({});
  await f.push({ type: 'message', conversationId: id, recipientId: 'alice' });
  f.setState({ owner: 'bob', enabled: true });
  await f.push({ type: 'message', conversationId: id, recipientId: 'alice' });
  assert.equal(f.shown.length, 0);
  await f.click({ conversationId: id, recipientId: 'alice' });
  assert.deepEqual(f.opened, ['https://marsupil.github.io/premeyzel/#/messages']);
});
test('notification clicks reuse an app window and cannot navigate outside the application', async () => {
  const f = fixture();
  let focused = false;
  f.setWindows([
    {
      url: 'https://marsupil.github.io/another-app/',
      navigate() {
        throw Error('wrong app');
      },
    },
    {
      url: 'https://marsupil.github.io/premeyzel/#/compte',
      async navigate(url) {
        f.navigated.push(url);
        return {
          async focus() {
            focused = true;
          },
        };
      },
    },
  ]);
  await f.click({ conversationId: id, recipientId: 'alice', url: 'https://evil.example' });
  assert.deepEqual(f.navigated, ['https://marsupil.github.io/premeyzel/#/messages?c=' + id]);
  assert.equal(focused, true);
  assert.equal(f.opened.length, 0);
  await f.push({ type: 'message', conversationId: 'https://evil.example', recipientId: 'alice' });
  assert.equal(f.shown.length, 0);
});
