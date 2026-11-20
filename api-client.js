export const API_BASE = 'https://premeyzel-parcours.mathias790372.chatgpt.site';
let tokenProvider = async () => null;
let generation = 0;
const pending = new Set();

export function setTokenProvider(provider) {
  tokenProvider = provider;
}
export async function accessToken() {
  return tokenProvider();
}
export const sessionGeneration = () => generation;
export const isSessionChange = (error) => error?.code === 'SESSION_CHANGED';
function sessionChanged() {
  return Object.assign(new Error('Votre session a changé. Reconnectez-vous pour continuer.'), {
    code: 'SESSION_CHANGED',
  });
}
export function invalidateSessionRequests() {
  generation++;
  for (const controller of pending) controller.abort();
  pending.clear();
}
function checkSession(serial) {
  if (serial !== generation) throw sessionChanged();
}

export async function requestWithMetadata(path, options = {}) {
  const serial = generation;
  const token = await accessToken();
  checkSession(serial);
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const { blob = false, signal, ...init } = options;
  if (init.body && typeof init.body !== 'string') {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(init.body);
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20000);
  pending.add(controller);
  try {
    let response;
    try {
      response = await fetch(API_BASE + '/api/' + path, {
        ...init,
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      checkSession(serial);
      if (signal?.aborted) throw error;
      throw new Error(
        'Connexion impossible. Vérifiez Internet et réessayez. Votre saisie est conservée.',
        { cause: error },
      );
    }
    checkSession(serial);
    if (response.status === 304) return null;
    let data;
    if (blob) {
      if (!response.ok) throw new Error('Photo indisponible.');
      data = await response.blob();
    } else {
      try {
        data = await response.json();
      } catch {
        checkSession(serial);
        throw new Error('Le service est momentanément indisponible.');
      }
    }
    checkSession(serial);
    if (!response.ok)
      throw Object.assign(new Error(data.error || 'L’action n’a pas pu être enregistrée.'), {
        status: response.status,
      });
    return { data, etag: response.headers.get('ETag') };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    pending.delete(controller);
  }
}
export async function request(path, options = {}) {
  return (await requestWithMetadata(path, options))?.data;
}
export async function allPages(path, key) {
  const records = [],
    serial = generation;
  let offset = 0;
  do {
    const page = await request(path + (path.includes('?') ? '&' : '?') + 'offset=' + offset);
    checkSession(serial);
    if (
      !Array.isArray(page?.[key]) ||
      (page.nextOffset != null &&
        (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset))
    ) {
      throw new Error('La liste reçue est invalide. Réessayez.');
    }
    records.push(...page[key]);
    offset = page.nextOffset;
  } while (offset != null);
  return records;
}
