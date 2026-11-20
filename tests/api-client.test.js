import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  request,
  requestWithMetadata,
  setTokenProvider,
  invalidateSessionRequests,
  allPages,
} from '../api-client.js';
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test('sign-out cancels an outstanding private request and discards a late response', async (t) => {
  invalidateSessionRequests();
  setTokenProvider(async () => 'old-token');
  const response = deferred(),
    started = deferred();
  let signal;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal;
    started.resolve();
    return response.promise;
  });
  const pending = request('posts?kind=ads');
  await started.promise;
  invalidateSessionRequests();
  assert.equal(signal.aborted, true);
  response.resolve(Response.json({ posts: [{ title: 'Private' }] }));
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
});
test('account changes during token retrieval never send the old credential', async (t) => {
  const token = deferred();
  let calls = 0;
  setTokenProvider(() => token.promise);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({});
  });
  const pending = request('me');
  invalidateSessionRequests();
  token.resolve('old-token');
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
  assert.equal(calls, 0);
});
test('account changes while reading a response body discard the private data', async (t) => {
  const body = deferred(),
    started = deferred();
  setTokenProvider(async () => null);
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => {
      started.resolve();
      return body.promise;
    },
  }));
  const pending = request('me');
  await started.promise;
  invalidateSessionRequests();
  body.resolve({ user: { name: 'Old user' } });
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
});
test('shared requests preserve JSON errors, blobs and trail cache metadata', async (t) => {
  setTokenProvider(async () => 'current-token');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response('{"ok":true}', {
      headers: { ETag: '"3"', 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(
    await requestWithMetadata('trails', { method: 'POST', body: { title: 'Test' } }),
    { data: { ok: true }, etag: '"3"' },
  );
  assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer current-token');
  assert.equal(calls[0].options.body, '{"title":"Test"}');
  assert.ok((await request('photo', { blob: true })) instanceof Blob);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 304 }));
  assert.equal(await requestWithMetadata('trails'), null);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Forbidden' }, { status: 403 }),
  );
  await assert.rejects(request('me'), { message: 'Forbidden', status: 403 });
});
test('pagination rejects repeated cursors instead of making an infinite sequence of requests', async (t) => {
  setTokenProvider(async () => null);
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    count++;
    return Response.json({ posts: [], nextOffset: 0 });
  });
  await assert.rejects(allPages('posts', 'posts'), /liste reçue est invalide/);
  assert.equal(count, 1);
});
