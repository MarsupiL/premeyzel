import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { escapeHTML } from '../html.js';

function fixture(send) {
  let serial = 0;
  const fields = [{ disabled: false }, { disabled: false }],
    handlers = {},
    error = { textContent: '', focus() {} },
    link = { focus() {} };
  const form = {
    dataset: {},
    isConnected: true,
    innerHTML: '',
    querySelector: (s) => (s === 'a' ? link : error),
    querySelectorAll: () => fields,
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
  };
  const data = new Map([
    ['category', 'problem'],
    ['body', 'Une suggestion'],
  ]);
  const context = vm.createContext({
    esc: escapeHTML,
    request: send,
    isSessionChange: (e) => e?.code === 'SESSION_CHANGED',
    crypto: { randomUUID: () => `request-${++serial}` },
    location: { hash: '' },
    FormData: class {
      get(k) {
        return data.get(k);
      }
    },
    document: { querySelector: (s) => (s === '#feedback-form' ? form : { textContent: '' }) },
  });
  const source = readFileSync(new URL('../feedback-ui.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replaceAll('export ', '');
  vm.runInContext(source, context);
  const ui = {
    modal(_title, html) {
      form.innerHTML = html;
    },
    refreshInbox() {},
  };
  return {
    context,
    form,
    fields,
    error,
    data,
    open: (id = 'alice') => context.openFeedback({ id }, 'trajets', ui),
    submit: () => handlers.submit({ preventDefault() {} }),
    input: () => handlers.input(),
  };
}

test('feedback form escapes drafts and explains private inbox/email delivery without collecting contact details', () => {
  const f = fixture();
  const html = f.context.feedbackForm(
    { category: 'idea', body: '</textarea><script>attack</script>' },
    'trajets',
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /name="category" value="idea" checked/);
  assert.match(html, /maxlength="3500"/);
  assert.match(html, /par e-mail/);
  assert.match(html, /Page concernée : Trajets/);
  assert.doesNotMatch(html, /name="(?:email|phone|recipientId)"/);
});

test('feedback reuses retry IDs, preserves text after failure and prevents concurrent double submits', async () => {
  const sent = [];
  let release;
  const f = fixture(async (path, options) => {
    assert.equal(path, 'feedback');
    sent.push({ ...options.body });
    await new Promise((r) => {
      release = r;
    });
    throw new Error('Réseau indisponible');
  });
  f.open();
  const first = f.submit();
  await f.submit();
  assert.equal(sent.length, 1);
  assert.ok(f.fields.every((field) => field.disabled));
  release();
  await first;
  assert.equal(f.error.textContent, 'Réseau indisponible');
  assert.ok(f.fields.every((field) => !field.disabled));
  const retry = f.submit();
  release();
  await retry;
  assert.equal(sent[0].id, sent[1].id);
  assert.equal(sent[1].body, 'Une suggestion');
  f.data.set('body', 'Une autre idée');
  f.input();
  const changed = f.submit();
  release();
  await changed;
  assert.notEqual(sent[1].id, sent[2].id);
});

test('feedback success links to the saved conversation; sign-out clears unsent private drafts', async () => {
  const f = fixture(async () => ({ conversationId: 'private-conversation' }));
  f.open();
  await f.submit();
  assert.match(f.form.innerHTML, /#\/messages\?c=private-conversation/);
  assert.match(f.form.innerHTML, /bien été enregistré/);
  f.open();
  f.data.set('body', 'Private unfinished draft');
  f.input();
  f.context.clearFeedbackDraft();
  f.open('bob');
  assert.doesNotMatch(f.form.innerHTML, /Private unfinished draft/);
});

test('closing and reopening while a submission completes cannot discard the new draft', async () => {
  let release;
  const f = fixture(async () => {
    await new Promise((r) => {
      release = r;
    });
    return { conversationId: 'saved' };
  });
  f.open();
  const sending = f.submit();
  delete f.form.dataset.saving;
  f.open();
  f.data.set('body', 'My next thought');
  f.input();
  f.form.isConnected = false;
  release();
  await sending;
  f.form.isConnected = true;
  f.open();
  assert.match(f.form.innerHTML, /My next thought/);
});
