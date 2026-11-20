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
  let timer = null;
  const context = {
    clearTimeout: () => {
      timer = null;
    },
    setTimeout: (callback) => {
      timer = callback;
      return 1;
    },
    hasActiveInput: () => false,
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
    `let user=null,events=[],ads=[],trips=[],tripExpiryTimer=null,members=[],refreshing=null,loading=true,loadError='';const isAdmin=()=>['owner','admin'].includes(user?.role);function render(){snapshot({user,events,ads,trips,members});}\n` +
      source.slice(start, end) +
      `\nthis.api={refreshData,clearSessionUI,state:()=>({user,events,ads,trips,members,loading})};`,
    context,
  );
  return {
    api: context.api,
    snapshots,
    expire: () => timer?.(),
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
    oldTrips = deferred(),
    started = deferred();
  f.setAccount(async () => ({ id: 'alice', role: 'admin' }));
  f.setPages((path) => {
    if (path.includes('trips')) return oldTrips.promise;
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
  oldTrips.resolve([{ title: 'Alice private ride', departureAt: Date.now() + 60000 }]);
  await old;
  assert.equal(f.api.state().user, null);
  assert.equal(f.api.state().ads.length, 0);
  assert.equal(f.api.state().trips.length, 0);
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

test('departure expiry refreshes the shared feed and sign-out cancels the timer', async () => {
  const f = fixture();
  f.setAccount(async () => ({ id: 'alice', role: 'member' }));
  let calls = 0;
  f.setPages(async (path) => {
    if (!path.includes('trips')) return [];
    calls++;
    return calls === 1 ? [{ id: 'trip', departureAt: Date.now() + 1000 }] : [];
  });
  await f.api.refreshData();
  assert.equal(f.api.state().trips.length, 1);
  f.expire();
  await f.api.refreshData();
  assert.equal(calls, 2);
  assert.equal(f.api.state().trips.length, 0);
  f.change();
  f.expire();
  assert.equal(calls, 2);
});
