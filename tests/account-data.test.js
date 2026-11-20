import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../resident-app.js', import.meta.url), 'utf8');
const start = source.indexOf('function clearSessionUI('),
  end = source.indexOf('document.addEventListener(', start);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture() {
  let generation = 0,
    account = async () => null,
    pages = async () => [];
  const snapshots = [];
  const context = {
    sessionGeneration: () => generation,
    isSessionChange: (error) => error?.code === 'SESSION_CHANGED',
    currentAccount: () => account(),
    allPages: (...args) => pages(...args),
    authConfig: () => ({ accountsEnabled: true }),
    clearPhotos() {},
    closeModal() {},
    setMessagingAccount() {},
    setTrailAccount() {},
    unmountTrails() {},
    avatar() {},
    loadPhotos() {},
    toast() {},
    modal() {},
    detail() {},
    snapshot: (value) => snapshots.push(JSON.parse(JSON.stringify(value))),
  };
  vm.createContext(context);
  vm.runInContext(
    `let user=null,events=[],ads=[],members=[],refreshing=null,loading=true,loadError='';const isAdmin=()=>['owner','admin'].includes(user?.role);function render(){snapshot({user,events,ads,members});}\n` +
      source.slice(start, end) +
      `\nthis.api={refreshData,clearSessionUI,state:()=>({user,events,ads,members,loading})};`,
    context,
  );
  return {
    api: context.api,
    snapshots,
    setAccount: (fn) => (account = fn),
    setPages: (fn) => (pages = fn),
    change() {
      generation++;
      context.api.clearSessionUI();
    },
  };
}
test('a request from a signed-out account cannot restore its private lists', async () => {
  const f = fixture(),
    oldAds = deferred(),
    started = deferred();
  f.setAccount(async () => ({ id: 'alice', role: 'admin' }));
  f.setPages((path) => {
    if (path.includes('ads')) {
      started.resolve();
      return oldAds.promise;
    }
    return Promise.resolve([]);
  });
  const old = f.api.refreshData();
  await started.promise;
  f.change();
  f.setAccount(async () => null);
  f.setPages(async () => []);
  await f.api.refreshData();
  oldAds.resolve([{ title: 'Alice private ad' }]);
  await old;
  assert.equal(f.api.state().user, null);
  assert.equal(f.api.state().ads.length, 0);
  assert.equal(f.api.state().members.length, 0);
  assert.ok(f.snapshots.every((s) => s.user === null && s.ads.length === 0));
});
test('late account lookup cannot overwrite a new session or release its refresh guard', async () => {
  const f = fixture(),
    oldAccount = deferred(),
    newAccount = deferred();
  f.setAccount(() => oldAccount.promise);
  const old = f.api.refreshData();
  f.change();
  let newCalls = 0;
  f.setAccount(() => {
    newCalls++;
    return newAccount.promise;
  });
  const fresh = f.api.refreshData();
  oldAccount.resolve({ id: 'alice', role: 'admin' });
  await old;
  assert.equal(f.api.refreshData(), fresh);
  assert.equal(newCalls, 1);
  newAccount.resolve({ id: 'bob', role: 'member' });
  await fresh;
  assert.equal(f.api.state().user.id, 'bob');
  assert.ok(f.snapshots.every((s) => s.user?.id === 'bob'));
});

test('token renewal and repeated same-account sign-in leave active drafts untouched', () => {
  const from = source.indexOf('let authSubject;'),
    to = source.indexOf('\nrender();', from);
  const calls = [];
  const context = {
    clearSessionUI: () => calls.push('clear'),
    render: () => calls.push('render'),
    refreshData: () => calls.push('refresh'),
    disconnectPush: async () => calls.push('disconnect'),
  };
  vm.createContext(context);
  vm.runInContext(
    "let user={id:'supabase:alice'};" + source.slice(from, to) + '\nthis.change=handleAuthChange;',
    context,
  );
  context.change('TOKEN_REFRESHED', 'alice');
  context.change('SIGNED_IN', 'alice');
  assert.deepEqual(calls, []);
  context.change('SIGNED_IN', 'bob');
  assert.deepEqual(calls, ['clear', 'render', 'refresh']);
  context.change('SIGNED_OUT', null);
  assert.deepEqual(calls.slice(-4), ['clear', 'render', 'disconnect', 'refresh']);
});
