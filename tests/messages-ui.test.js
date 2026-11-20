import { escapeHTML as esc } from '../html.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeSearch } from '../search.js';

const source = readFileSync(new URL('../messages-ui.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replaceAll('export ', '');
function fixture({ failSend = false } = {}) {
  const calls = [],
    badges = [],
    focus = [],
    nodes = {},
    document = { hidden: false, activeElement: null, querySelectorAll: () => [] };
  const textarea = {
    value: 'Bonjour Alice',
    disabled: false,
    focus() {
      focus.push({ disabled: this.disabled });
      document.activeElement = this;
    },
  };
  const button = { disabled: false },
    error = {
      textContent: '',
      focus() {
        document.activeElement = this;
      },
    };
  const form = {
    id: 'dm-form',
    querySelector: (s) => (s === 'textarea' ? textarea : s === '[type="submit"]' ? button : error),
  };
  let feedHTML = '',
    listHTML = '',
    writes = 0;
  const feed = {
    scrollTop: 200,
    scrollHeight: 1000,
    clientHeight: 300,
    nextHeight: 1200,
    get innerHTML() {
      return feedHTML;
    },
    set innerHTML(v) {
      feedHTML = v;
      this.scrollHeight = this.nextHeight;
    },
  };
  const list = {
    dataset: {},
    contains: (e) => e === document.activeElement && !!e,
    get innerHTML() {
      return listHTML;
    },
    set innerHTML(v) {
      listHTML = v;
      writes++;
    },
    querySelectorAll: () => [],
  };
  Object.assign(nodes, {
    '#dm-feed': feed,
    '#dm-list': list,
    '#dm-form': form,
    '#dm-body': textarea,
    '#dm-send-error': error,
    '#dm-status': { textContent: '' },
    '#dm-older': { hidden: true },
    '#dm-context': { replaceChildren() {} },
  });
  const message = { seq: 1, mine: true, body: 'Bonjour Alice', created: '2026-11-20T10:00:00Z' };
  const context = {
    esc,
    normalizeSearch,
    updateAppBadge: (count) => badges.push(count),
    document,
    navigator: { onLine: true },
    location: { hash: '#/messages?c=test' },
    history: { replaceState() {} },
    URLSearchParams,
    crypto: { randomUUID: () => 'new-message-id' },
    setInterval() {},
    clearInterval() {},
    icon: () => '',
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('/messages')) {
        if (failSend) throw Error('Test connection failed');
        return { message };
      }
      return { peer: { name: 'Alice' }, messages: [message], nextBefore: null };
    },
    allPages: async () => [],
    rootFixture: { querySelector: (s) => nodes[s] },
    uiFixture: { avatar: () => '', loadPhotos() {} },
  };
  vm.createContext(context);
  vm.runInContext(
    source +
      `\nroot=rootFixture;ui=uiFixture;viewer={id:'owner'};activeId='test';pollCursor=1;peer={name:'Alice'};messages=[${JSON.stringify(message)}];drafts.set('test',{text:'Bonjour Alice',key:'retry-id'});this.api={renderFeed,renderList,onSubmit,onClick,setDirectory:fn=>directory=fn,loadThread,setRequest:fn=>request=fn,setPages:fn=>allPages=fn,refreshInbox,setMessagingAccount,rows:()=>messages,getDraft:()=>drafts.get('test')};`,
    context,
  );
  return {
    api: context.api,
    feed,
    list,
    textarea,
    button,
    error,
    document,
    focus,
    calls,
    badges,
    writes: () => writes,
    submit: () => context.api.onSubmit({ target: form, preventDefault() {} }),
  };
}
test('refreshing unread messages updates the app badge and reading them clears it', async () => {
  const f = fixture();
  f.api.setPages(async () => [
    {
      id: 'test',
      peer: { name: 'Alice' },
      unread: 3,
      preview: 'Bonjour',
      updated: '2026-11-20T10:00:00Z',
    },
  ]);
  await f.api.refreshInbox();
  assert.equal(f.badges.at(-1), 3);
  f.api.setPages(async () => []);
  await f.api.refreshInbox();
  assert.equal(f.badges.at(-1), 0);
  f.api.setMessagingAccount(null, {});
  assert.equal(f.badges.at(-1), 0);
});

test('French searches match accents, ligatures, case and extra spaces', () => {
  for (const [name, query] of [
    ['Émilie Dupont', ' emilie  dupont '],
    ['Les Châtaignes', 'chataignes'],
    ['Œufs frais', 'oeufs'],
    ['Prêt d’une perceuse', 'PRET'],
  ])
    assert.ok(normalizeSearch(name).includes(normalizeSearch(query)));
  assert.equal(normalizeSearch(null), '');
  assert.equal(normalizeSearch(' <script> '), '<script>');
});
test('background message updates keep the reader in place; older messages preserve the visible passage', () => {
  const incoming = fixture();
  incoming.api.renderFeed();
  assert.equal(incoming.feed.scrollTop, 200);
  const older = fixture();
  older.api.renderFeed(false, true);
  assert.equal(older.feed.scrollTop, 400);
  const bottom = fixture();
  bottom.feed.scrollTop = 690;
  bottom.api.renderFeed();
  assert.equal(bottom.feed.scrollTop, 1200);
});
test('unchanged inbox polling does not rebuild links and discard keyboard focus', () => {
  const f = fixture();
  f.api.renderList();
  assert.equal(f.writes(), 1);
  f.api.renderList();
  assert.equal(f.writes(), 1);
});
test('successful send clears the draft and restores focus only after enabling the composer', async () => {
  const f = fixture();
  await f.submit();
  assert.equal(f.textarea.value, '');
  assert.equal(f.textarea.disabled, false);
  assert.equal(f.button.disabled, false);
  assert.deepEqual(f.focus, [{ disabled: false }]);
  assert.equal(f.document.activeElement, f.textarea);
  assert.equal(f.api.getDraft(), undefined);
  assert.equal(f.calls.filter((c) => c.path.endsWith('/messages')).length, 1);
});
test('failed send retains the message and retry ID, enables the composer and focuses the error', async () => {
  const f = fixture({ failSend: true });
  await f.submit();
  assert.equal(f.textarea.value, 'Bonjour Alice');
  assert.equal(f.api.getDraft().key, 'retry-id');
  assert.equal(f.textarea.disabled, false);
  assert.equal(f.button.disabled, false);
  assert.equal(f.document.activeElement, f.error);
});
test('opening the directory keeps its trigger focusable and ignores repeated clicks while loading', async () => {
  const f = fixture(),
    attrs = new Map();
  let complete,
    opens = 0;
  f.api.setDirectory(() => {
    opens++;
    return new Promise((resolve) => (complete = resolve));
  });
  const trigger = {
      dataset: { dm: 'new' },
      disabled: false,
      getAttribute: (k) => attrs.get(k),
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
    },
    event = { target: { closest: () => trigger } };
  const opening = f.api.onClick(event);
  assert.equal(trigger.disabled, false);
  assert.equal(attrs.get('aria-busy'), 'true');
  await f.api.onClick(event);
  assert.equal(opens, 1);
  complete();
  await opening;
  assert.equal(attrs.has('aria-busy'), false);
});

test('polling catches up across multiple pages and sending does not skip unseen messages', async () => {
  const f = fixture(),
    read = [],
    after = [];
  f.api.setRequest(async (path, options) => {
    if (path.endsWith('/messages'))
      return {
        message: { seq: 120, mine: true, body: 'My reply', created: '2026-11-20T10:00:00Z' },
      };
    if (path.endsWith('/read')) {
      read.push(options.body.through);
      return { ok: true };
    }
    const cursor = Number(new URL('https://example.test/' + path).searchParams.get('after'));
    after.push(cursor);
    const end = Math.min(cursor + 50, 120),
      rows = [];
    for (let seq = cursor + 1; seq <= end; seq++)
      rows.push({ seq, mine: false, body: 'Message ' + seq, created: '2026-11-20T10:00:00Z' });
    return { peer: { name: 'Alice' }, messages: rows, nextAfter: end < 120 ? end : null };
  });
  await f.submit();
  assert.deepEqual(after, [1, 51, 101]);
  assert.deepEqual(read, [120]);
  assert.deepEqual(
    Array.from(f.api.rows(), (row) => row.seq),
    Array.from({ length: 120 }, (_, i) => i + 1),
  );
});
