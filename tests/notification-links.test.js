import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { escapeHTML as esc } from '../html.js';

const links = readFileSync(new URL('../notification-links.js', import.meta.url), 'utf8').replaceAll(
  'export ',
  '',
);
const resident = readFileSync(new URL('../resident-app.js', import.meta.url), 'utf8');
const eventId = '41345550-1c65-4aaa-8fbd-ef7eeebc41c1';
const target = '#/evenements?event=' + eventId;

function fixture({
  request = async () => ({
    id: eventId,
    kind: 'events',
    title: 'La fête du four',
    date: '2099-10-31',
    used: 0,
  }),
} = {}) {
  const storage = new Map(),
    shown = [],
    calls = [];
  const location = { hash: target };
  const context = {
    URLSearchParams,
    Date,
    location,
    esc,
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    request: (...args) => {
      calls.push(args);
      return request(...args);
    },
    modal: (...args) => shown.push(args),
    icon: () => '',
    dateText: (value) => value,
    visual: () => '',
    badge: () => '',
    canManage: () => false,
    isSessionChange: (error) => error.code === 'SESSION_CHANGED',
  };
  vm.createContext(context);
  vm.runInContext(
    links +
      '\nlet loading=false, linkedEvent="", detailRequest=0, user=null;\n' +
      resident.slice(
        resident.indexOf('async function detail('),
        resident.indexOf('async function compose('),
      ) +
      '\nthis.api={notificationDestination,rememberNotificationDestination,takeNotificationDestination,openLinkedEvent};',
    context,
  );
  return { api: context.api, location, storage, shown, calls };
}

test('notification destinations allow only local conversation/event UUIDs and discard untrusted parameters', () => {
  const f = fixture();
  assert.equal(f.api.notificationDestination(target + '&url=https://evil.example'), target);
  for (const hash of [
    'https://evil.example',
    '#/evenements?event=../../secret',
    '#/messages?c=bad',
    '#/admin',
  ])
    assert.equal(f.api.notificationDestination(hash), '');
  f.location.hash = '#/connexion?next=' + encodeURIComponent(target);
  f.api.rememberNotificationDestination();
  assert.equal(f.api.takeNotificationDestination(), target);
  assert.equal(f.storage.size, 0);
  assert.equal(f.api.takeNotificationDestination(), '');
  f.location.hash = '#/connexion?next=https://evil.example';
  f.api.rememberNotificationDestination();
  assert.equal(f.api.takeNotificationDestination(), '');
});

test('an event deep link opens its current details once, even without a session', async () => {
  const f = fixture();
  await f.api.openLinkedEvent();
  await f.api.openLinkedEvent();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'posts/' + eventId);
  assert.equal(f.shown[0][0], 'La fête du four');
  assert.match(f.shown[0][1], /connexion\?next=/);
});

test('a removed event gives an unavailable notice and a way back to events', async () => {
  const f = fixture({
    request: async () => {
      throw new Error('Cette publication n’est plus disponible.');
    },
  });
  await f.api.openLinkedEvent();
  assert.equal(f.shown[0][0], 'Événement indisponible');
  assert.match(f.shown[0][1], /href="#\/evenements"/);
});

test('leaving the page while an event loads cannot reopen its dialog', async () => {
  let resolve;
  const f = fixture({
    request: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = f.api.openLinkedEvent();
  f.location.hash = '#/compte';
  resolve({ id: eventId, kind: 'events' });
  await pending;
  assert.equal(f.shown.length, 0);
});
