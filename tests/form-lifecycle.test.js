import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../resident-app.js', import.meta.url), 'utf8');
const submitSource = source.slice(
  source.indexOf("document.addEventListener('submit',"),
  source.indexOf("document.addEventListener('change',"),
);
function fixture(id) {
  let submit, finishRequest;
  const calls = [],
    field = { dataset: {}, disabled: false },
    cancel = { dataset: { action: 'close' }, disabled: false };
  const button = { dataset: {}, disabled: false },
    error = { textContent: '', focus() {} };
  const form = {
    id,
    dataset: { id: 'post-id', revision: '1', role: 'admin' },
    isConnected: true,
    elements: [field, button, cancel],
    querySelector: (selector) => (selector === '[type="submit"]' ? button : error),
  };
  const location = { hash: '#/compte' };
  const context = vm.createContext({
    document: {
      addEventListener: (_event, fn) => {
        submit = fn;
      },
    },
    FormData: class extends Map {
      constructor() {
        super([
          ['name', 'Alice'],
          ['title', 'Une rencontre'],
          ['date', '2099-12-01'],
          ['capacity', '5'],
          ['count', '1'],
        ]);
      }
    },
    location,
    request: async (path, options) => {
      calls.push({ path, options });
      return new Promise((resolve) => {
        finishRequest = () => resolve({ user: { id: 'alice', name: 'Alice' } });
      });
    },
    closeModal: () => {
      calls.push('close');
      form.isConnected = false;
    },
    toast: () => {},
    refreshData: async (redraw) => calls.push({ redraw }),
    hasActiveInput: () => true,
    detail: async () => calls.push('detail'),
    isSessionChange: () => false,
  });
  vm.runInContext(
    "let user={id:'alice'},draft={id:'post-id',kind:'events',busy:false},profileDraft={photo:null,busy:false},detailRequest=0,query='',filter='Tout';\n" +
      submitSource,
    context,
  );
  return {
    form,
    field,
    button,
    cancel,
    calls,
    location,
    finish: () => finishRequest(),
    submit: () => submit({ target: form, preventDefault() {} }),
  };
}

test('late saves do not close a newer dialog or navigate away from its draft', async () => {
  for (const id of ['post-form', 'profile-form', 'registration-form', 'delete-form', 'role-form']) {
    const f = fixture(id),
      saving = f.submit();
    assert.equal(f.field.disabled, true);
    assert.equal(f.cancel.disabled, false, 'cancel remains available');
    await f.submit();
    assert.equal(f.calls.length, 1, 'duplicate submits are ignored');
    f.form.isConnected = false; // The user closes this form and starts another.
    f.finish();
    await saving;
    assert.ok(!f.calls.includes('close'), id);
    assert.ok(!f.calls.includes('detail'), id);
    assert.equal(f.location.hash, '#/compte', id);
    assert.equal(f.field.disabled, false);
    assert.deepEqual(f.calls.at(-1), { redraw: false });
  }
});

test('a save still closes its own form and uses values captured before disabling controls', async () => {
  const f = fixture('post-form'),
    saving = f.submit();
  assert.equal(f.calls[0].options.body.title, 'Une rencontre');
  assert.equal(f.calls[0].options.body.date, '2099-12-01');
  f.finish();
  await saving;
  assert.ok(f.calls.includes('close'));
  assert.equal(f.location.hash, '#/evenements');
});
