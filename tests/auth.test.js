import { escapeHTML as esc } from '../html.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../auth.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replaceAll('export ', '');
const linkSource = readFileSync(
  new URL('../notification-links.js', import.meta.url),
  'utf8',
).replaceAll('export ', '');
function fixture({
  callback,
  event,
  stored,
  session = { user: { id: 'alice' } },
  initError,
  delivery = true,
  error,
} = {}) {
  const calls = [],
    storage = new Map(stored ? [['premeyzel-password-recovery-v1', JSON.stringify(stored)]] : []),
    location = new URL(callback || 'https://marsupil.github.io/premeyzel/#/connexion');
  let listener, provider;
  const auth = {
    onAuthStateChange(fn) {
      listener = fn;
    },
    async initialize() {
      if (event) listener(event, session);
      return { error: initError };
    },
    async getSession() {
      return { data: { session } };
    },
    async signOut() {
      listener('SIGNED_OUT', null);
      return {};
    },
  };
  for (const method of [
    'signUp',
    'signInWithPassword',
    'resetPasswordForEmail',
    'resend',
    'updateUser',
    'signInWithOAuth',
  ])
    auth[method] = async (...args) => {
      calls.push({ method, args });
      return { data: method === 'signUp' ? { session: null } : { session }, error };
    };
  const config = {
    configured: true,
    accountsEnabled: true,
    emailDeliveryEnabled: delivery,
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'public-test',
    providers: { google: true, apple: true },
  };
  const context = {
    esc,
    createClient: () => ({ auth }),
    API_BASE: 'https://api.example.test',
    invalidateSessionRequests() {},
    setTokenProvider: (fn) => (provider = fn),
    request: async () => ({ user: null }),
    fetch: async () => new Response(JSON.stringify(config)),
    AbortSignal,
    URL,
    URLSearchParams,
    Response,
    Date,
    setTimeout: (fn) => {
      queueMicrotask(fn);
    },
    location,
    history: {
      replaceState(a, b, url) {
        location.href = new URL(url, location).href;
      },
    },
    sessionStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
  };
  vm.createContext(context);
  vm.runInContext(
    linkSource +
      '\n' +
      source +
      '\nthis.api={initializeAuth,signIn,signInWithEmail,registerWithEmail,requestPasswordReset,resendConfirmation,updateRecoveredPassword,isPasswordRecovery,signOut,authErrorMessage};',
    context,
  );
  return {
    api: context.api,
    calls,
    storage,
    location,
    emit: (e, s = session) => listener(e, s),
    provider: () => provider,
  };
}
test('email credentials go only to Supabase, preserve passwords, and registration cannot choose roles', async () => {
  const f = fixture();
  await f.api.initializeAuth(() => {});
  await f.api.signInWithEmail(' alice@example.test ', ' test password ');
  assert.equal(f.calls[0].method, 'signInWithPassword');
  assert.equal(f.calls[0].args[0].password, ' test password ');
  assert.equal(f.calls[0].args[0].email, 'alice@example.test');
  await f.api.registerWithEmail(' Alice ', 'alice@example.test', 'long test password');
  const signup = f.calls[1].args[0];
  assert.equal(signup.options.data.full_name, 'Alice');
  assert.deepEqual(Object.keys(signup.options.data), ['full_name']);
  assert.equal(signup.options.emailRedirectTo, 'https://marsupil.github.io/premeyzel/');
  assert.equal(f.storage.size, 0);
  await assert.rejects(f.api.signIn('apple'), /pas disponible/);
});
test('Google sign-in returns to the notification conversation instead of the profile', async () => {
  const target = '#/messages?c=41345550-1c65-4aaa-8fbd-ef7eeebc41c1';
  const f = fixture({ callback: 'https://marsupil.github.io/premeyzel/' + target });
  await f.api.initializeAuth(() => {});
  await f.api.signIn('google');
  f.location.href = 'https://marsupil.github.io/premeyzel/?code=test-code';
  await f.api.initializeAuth(() => {});
  assert.equal(f.location.hash, target);
  assert.equal(f.location.search, '');
  assert.equal(f.storage.size, 0);
});
test('captures recovery emitted during initialization, removes code, and allows one password update', async () => {
  const f = fixture({
    callback: 'https://marsupil.github.io/premeyzel/?auth=recovery&code=one-use',
    event: 'PASSWORD_RECOVERY',
  });
  await f.api.initializeAuth(() => {});
  assert.equal(f.api.isPasswordRecovery(), true);
  assert.equal(f.location.hash, '#/connexion?mode=reset');
  assert.equal(f.location.search, '');
  await f.api.updateRecoveredPassword('new test password');
  assert.equal(f.calls.at(-1).method, 'updateUser');
  assert.equal(f.api.isPasswordRecovery(), false);
  assert.equal(f.storage.size, 0);
  await assert.rejects(f.api.updateRecoveredPassword('another password'), /nouveau lien/);
});
test('recovery marker survives reload only for its account, within its lifetime', async () => {
  const stored = { id: 'alice', expires: Date.now() + 100000 };
  const same = fixture({ stored });
  await same.api.initializeAuth(() => {});
  assert.equal(same.api.isPasswordRecovery(), true);
  for (const options of [
    { stored, session: { user: { id: 'bob' } } },
    { stored: { ...stored, expires: 1 } },
    { stored, session: null },
  ]) {
    const f = fixture(options);
    await f.api.initializeAuth(() => {});
    assert.equal(f.api.isPasswordRecovery(), false);
    await assert.rejects(f.api.updateRecoveredPassword('new test password'));
    assert.equal(f.calls.length, 0);
  }
});
test('a reset query alone grants no recovery; expired codes are removed from browser history', async () => {
  const fake = fixture({ callback: 'https://marsupil.github.io/premeyzel/?auth=recovery' });
  await fake.api.initializeAuth(() => {});
  await assert.rejects(fake.api.updateRecoveredPassword('new test password'));
  assert.equal(fake.calls.length, 0);
  const failed = fixture({
    callback: 'https://marsupil.github.io/premeyzel/?auth=recovery&code=expired',
    initError: { code: 'flow_state_expired' },
  });
  await assert.rejects(
    failed.api.initializeAuth(() => {}),
    /lien/,
  );
  assert.equal(failed.location.search, '');
  assert.equal(failed.location.hash, '#/connexion?mode=reset');
});
test('confirmation and reset use the app URL, with separate recovery callback', async () => {
  const f = fixture();
  await f.api.initializeAuth(() => {});
  await f.api.requestPasswordReset(' alice@example.test ');
  await f.api.resendConfirmation('alice@example.test');
  assert.equal(
    f.calls[0].args[1].redirectTo,
    'https://marsupil.github.io/premeyzel/?auth=recovery',
  );
  assert.equal(f.calls[1].args[0].type, 'signup');
  assert.equal(f.calls[1].args[0].options.emailRedirectTo, 'https://marsupil.github.io/premeyzel/');
});
test('unfinished email delivery blocks signup and reset but keeps existing password login usable', async () => {
  const f = fixture({ delivery: false });
  await f.api.initializeAuth(() => {});
  await assert.rejects(
    f.api.registerWithEmail('Alice', 'alice@example.test', 'test password'),
    /prochainement/,
  );
  await assert.rejects(f.api.requestPasswordReset('alice@example.test'));
  await assert.rejects(f.api.resendConfirmation('alice@example.test'));
  await f.api.signInWithEmail('alice@example.test', 'test password');
  assert.equal(f.calls.length, 1);
});
test('authentication failures are translated and never echo raw server errors or passwords', async () => {
  const f = fixture({ error: { code: 'invalid_credentials', message: 'sensitive test error' } });
  await f.api.initializeAuth(() => {});
  await assert.rejects(
    f.api.signInWithEmail('alice@example.test', 'test password'),
    /Adresse e-mail ou mot de passe incorrect/,
  );
  assert.doesNotMatch(f.api.authErrorMessage({ message: 'sensitive test error' }), /sensitive/);
});
test('reset server errors are not reported as an Internet failure', async () => {
  for (const status of [500, 502, 503, 504, 520]) {
    const f = fixture({
      error: {
        name: 'AuthRetryableFetchError',
        status,
        message: '535 Authentication failed: private SMTP details',
      },
    });
    await f.api.initializeAuth(() => {});
    await assert.rejects(f.api.requestPasswordReset('alice@example.test'), (error) => {
      assert.match(error.message, /service de connexion rencontre un problème/);
      assert.doesNotMatch(error.message, /Internet|SMTP|535|private/);
      return true;
    });
  }
  const f = fixture();
  assert.match(
    f.api.authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }),
    /Vérifiez Internet/,
  );
  assert.match(
    f.api.authErrorMessage({ name: 'AuthRetryableFetchError', status: 429 }),
    /Trop de tentatives/,
  );
});
test('logout clears recovery state and short passwords never reach Supabase', async () => {
  const f = fixture({ event: 'PASSWORD_RECOVERY' });
  await f.api.initializeAuth(() => {});
  await assert.rejects(f.api.updateRecoveredPassword('short'));
  assert.equal(f.calls.length, 0);
  await f.api.signOut();
  assert.equal(f.storage.size, 0);
  assert.equal(f.api.isPasswordRecovery(), false);
});

const uiSource = readFileSync(new URL('../auth-ui.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replaceAll('export ', '');
function uiFixture(
  mode,
  { password = 'local test phrase', confirmation = password, fail = false } = {},
) {
  let handler,
    completed = null;
  const calls = [],
    error = { textContent: '', focus() {} },
    status = { hidden: true, focus() {} },
    button = { disabled: false };
  const fields = {
    name: { value: 'Alice' },
    email: { value: 'alice@example.test' },
    password: { value: password },
    confirmation: { value: confirmation },
  };
  const form = {
    dataset: { mode },
    elements: fields,
    addEventListener: (e, fn) => (handler = fn),
    querySelector: (s) => (s.includes('error') ? error : s.includes('status') ? status : button),
    setAttribute() {},
    removeAttribute() {},
  };
  const operation =
    (name) =>
    async (...args) => {
      calls.push({ name, args });
      if (fail) throw new Error('Test indisponible');
      return { session: null };
    };
  const context = {
    esc,
    URLSearchParams,
    location: { hash: '#/connexion?mode=' + mode },
    document: { querySelector: () => form },
    authConfig: () => ({ configured: true, accountsEnabled: true, emailDeliveryEnabled: true }),
    isPasswordRecovery: () => true,
    signInWithEmail: operation('login'),
    registerWithEmail: operation('signup'),
    requestPasswordReset: operation('forgot'),
    resendConfirmation: operation('resend'),
    updateRecoveredPassword: operation('reset'),
  };
  vm.createContext(context);
  vm.runInContext(uiSource + '\nthis.ui={mountEmailForm,emailForm};', context);
  context.ui.mountEmailForm(async (m) => (completed = m));
  return {
    submit: () => handler({ preventDefault() {} }),
    fields,
    error,
    status,
    button,
    calls,
    completed: () => completed,
    html: () => context.ui.emailForm(),
  };
}
test('forms submit each flow, preserve non-secret fields on failure and erase passwords', async () => {
  for (const mode of ['login', 'signup', 'forgot', 'resend', 'reset']) {
    const f = uiFixture(mode);
    await f.submit();
    assert.equal(f.calls[0].name, mode);
    assert.equal(f.fields.password.value, '');
    assert.equal(f.fields.confirmation.value, '');
    assert.equal(f.button.disabled, false);
    if (['signup', 'forgot', 'resend'].includes(mode)) {
      assert.equal(f.status.hidden, false);
      assert.match(f.status.textContent, /Si /);
      assert.equal(f.completed(), null);
    } else assert.notEqual(f.completed(), null);
  }
  const failed = uiFixture('login', { fail: true });
  await failed.submit();
  assert.match(failed.error.textContent, /indisponible/);
  assert.equal(failed.fields.password.value, '');
  assert.equal(failed.fields.email.value, 'alice@example.test');
  assert.equal(failed.completed(), null);
});
test('mismatched confirmation never changes the password', async () => {
  const f = uiFixture('reset', { confirmation: 'different' });
  f.fields.confirmation.focus = () => {};
  await f.submit();
  assert.equal(f.calls.length, 0);
  assert.match(f.error.textContent, /correspondent pas/);
});
