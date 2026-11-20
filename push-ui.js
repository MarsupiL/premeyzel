import { escapeHTML as esc } from './html.js';
import { request } from './api-client.js';

const STATE_CACHE = 'premeyzel-push-state-v1';
const stateURL = new URL('./push-state', import.meta.url).href;
const supported = () =>
  isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;
const ios = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let owner = null,
  config = null,
  enabled = false,
  busy = false,
  checked = 0,
  error = '',
  epoch = 0;
let registration = null;
if ('serviceWorker' in navigator)
  registration = navigator.serviceWorker
    .register('./sw.js')
    .then(async () => {
      let timer;
      try {
        return await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error('Les notifications ne sont pas encore prêtes. Rechargez la page.'),
                ),
              12000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })
    .catch(() => null);
async function readState() {
  return (await (await caches.open(STATE_CACHE)).match(stateURL))?.json() || {};
}
// Serialize storage writes so a delayed opt-in cannot restore state after logout.
let stateWrite = Promise.resolve();
function writeState(value, serial = epoch) {
  stateWrite = stateWrite
    .catch(() => {})
    .then(async () => {
      if (serial !== epoch) return;
      await (
        await caches.open(STATE_CACHE)
      ).put(
        stateURL,
        new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }),
      );
    });
  return stateWrite;
}
async function getRegistration() {
  const reg = await registration;
  if (!reg) throw new Error('Les notifications ne sont pas encore prêtes. Rechargez la page.');
  return reg;
}
function bytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
function changed() {
  document.querySelectorAll('[data-push-settings]').forEach((el) => (el.innerHTML = content()));
}
function content() {
  let text =
      'Recevez une alerte pour vos nouveaux messages et les nouveaux événements du village, même lorsque l’application est fermée. Le contenu des messages reste masqué.',
    button = '';
  if (ios() && !standalone())
    text =
      'Sur iPhone ou iPad (iOS 16.4 ou plus récent), ajoutez Prémeyzel à l’écran d’accueil depuis le menu Partager, ouvrez l’application depuis son icône, puis activez les notifications ici.';
  else if (!supported())
    text =
      'Les notifications ne sont pas disponibles dans ce navigateur. Ouvrez Prémeyzel dans un navigateur compatible, comme Safari, Chrome, Edge ou Firefox.';
  else {
    if (enabled)
      text =
        'Activées sur cet appareil. Une alerte vous prévient des nouveaux messages et des nouveaux événements du village, même lorsque l’application est fermée. Le contenu des messages reste masqué.';
    else if (Notification.permission === 'denied')
      text =
        'Les notifications sont bloquées. Autorisez-les dans les réglages de ce site ou de votre appareil, puis revenez ici.';
    else if (config?.enabled === false)
      text =
        'Le service de notifications est momentanément indisponible. Vous pouvez toujours lire vos messages dans l’application.';
    const canEnable = Notification.permission !== 'denied' && config?.enabled !== false;
    button = enabled
      ? `<button class="btn secondary" data-push-action="disable" ${busy ? 'disabled' : ''}>Désactiver sur cet appareil</button>`
      : canEnable
        ? `<button class="btn primary" data-push-action="enable" ${busy || !config ? 'disabled' : ''}>${busy ? 'Veuillez patienter…' : 'Activer les notifications'}</button>`
        : '';
  }
  return `<div><h2>Notifications du village</h2><p>${text}</p><p class="fine">Ce choix est propre à chaque appareil. La livraison dépend de la connexion Internet et des réglages de notifications de votre appareil.</p>${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}</div>${button}`;
}
export function pushSettings() {
  return `<section class="activity-section push-settings" data-push-settings aria-live="polite">${content()}</section>`;
}
export async function syncPushAccount(user, force = false) {
  if (!user) return;
  if (owner !== user.id) {
    owner = user.id;
    epoch++;
    checked = 0;
    enabled = false;
    config = null;
    error = '';
  }
  if (!supported() || busy || (!force && Date.now() - checked < 60000)) {
    changed();
    return;
  }
  busy = true;
  const current = owner,
    serial = epoch;
  changed();
  try {
    const reg = await getRegistration(),
      saved = await readState();
    let sub = await reg.pushManager.getSubscription();
    if (serial !== epoch) return;
    if (saved.owner && saved.owner !== current) {
      await writeState({}, serial);
      if (serial !== epoch) return;
      if (sub && !(await sub.unsubscribe()))
        throw new Error('Impossible de changer le compte des notifications. Réessayez.');
      sub = null;
    }
    const nextConfig = await request('push/config');
    if (serial !== epoch) return;
    config = nextConfig;
    enabled = false;
    if (
      sub &&
      saved.owner === current &&
      saved.enabled &&
      Notification.permission === 'granted' &&
      config.enabled
    ) {
      const status = await request('push/status', {
        method: 'POST',
        body: { endpoint: sub.endpoint },
      });
      if (serial !== epoch) return;
      if (!status.subscribed)
        await request('push/subscription', { method: 'PUT', body: sub.toJSON() });
      if (serial !== epoch) return;
      enabled = true;
    } else if (
      saved.owner === current &&
      saved.enabled &&
      !sub &&
      Notification.permission === 'granted' &&
      config.enabled
    ) {
      // Repair an expired subscription on the next visit; never prompt automatically.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes(config.publicKey),
      });
      if (serial !== epoch) {
        await sub.unsubscribe();
        return;
      }
      await request('push/subscription', { method: 'PUT', body: sub.toJSON() });
      if (serial !== epoch) {
        await sub.unsubscribe();
        return;
      }
      enabled = true;
    }
    checked = Date.now();
    error = '';
  } catch (err) {
    if (serial === epoch) error = err.message;
  } finally {
    busy = false;
    changed();
    if (owner && owner !== current) syncPushAccount({ id: owner }, true);
  }
}
async function enable(permission) {
  const current = owner,
    serial = epoch;
  busy = true;
  error = '';
  changed();
  try {
    const granted = await permission;
    if (serial !== epoch) return;
    if (granted !== 'granted')
      throw new Error(
        'Notifications non autorisées. Vous pouvez les activer plus tard dans les réglages du navigateur.',
      );
    const reg = await getRegistration();
    if (serial !== epoch) return;
    const nextConfig = await request('push/config');
    if (serial !== epoch) return;
    config = nextConfig;
    if (!config.enabled) throw new Error('Les notifications sont momentanément indisponibles.');
    let sub = await reg.pushManager.getSubscription();
    const saved = await readState();
    if (serial !== epoch) return;
    if (sub && saved.owner !== current) {
      if (!(await sub.unsubscribe()))
        throw new Error('Impossible de renouveler les notifications. Réessayez.');
      sub = null;
    }
    sub ||= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes(config.publicKey),
    });
    if (serial !== epoch) {
      await sub.unsubscribe();
      return;
    }
    await request('push/subscription', { method: 'PUT', body: sub.toJSON() });
    if (serial !== epoch) {
      await sub.unsubscribe();
      return;
    }
    await writeState({ owner: current, enabled: true }, serial);
    if (serial !== epoch) return;
    enabled = true;
    checked = Date.now();
  } catch (err) {
    if (serial === epoch) error = err.message;
  } finally {
    busy = false;
    changed();
    if (owner && owner !== current) syncPushAccount({ id: owner }, true);
  }
}
export async function updateAppBadge(count) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  try {
    if (count === 0 && 'clearAppBadge' in navigator) await navigator.clearAppBadge();
    else if ('setAppBadge' in navigator) await navigator.setAppBadge(count);
  } catch {
    // Optional OS badging must never prevent reading messages or signing out.
  }
}
// Remove the server subscription before logout; local unsubscribe also prevents
// future delivery if the network fails. An already queued declarative push may
// still show its generic fallback; it carries no private text or account link.
export async function disconnectPush(logout = false) {
  epoch++;
  if (logout) owner = null;
  enabled = false;
  checked = 0;
  await updateAppBadge(0);
  if (!('caches' in window)) return;
  // Restricted/private browsers may expose CacheStorage but refuse writes.
  // Continue unsubscribing so notification support can never trap someone signed in.
  try {
    await writeState({});
  } catch {}
  const reg = await registration;
  if (!reg) return;
  if (!reg.pushManager) return;
  try {
    const notifications = (await reg.getNotifications?.()) || [];
    notifications.forEach((n) => n.close());
  } catch {}
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  let removed = false;
  try {
    await request('push/subscription', { method: 'DELETE', body: { endpoint: sub.endpoint } });
    removed = true;
  } catch {}
  let unsubscribed = false;
  try {
    unsubscribed = await sub.unsubscribe();
  } catch {}
  if (!removed && !unsubscribed)
    throw new Error(
      'Impossible de désactiver les notifications. Vérifiez votre connexion et réessayez.',
    );
}
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-push-action]');
  if (!button || busy || !owner) return;
  if (button.dataset.pushAction === 'enable') {
    // Permission must be requested directly during the user's click (not after fetch).
    const permission =
      Notification.permission === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    enable(permission);
  } else if (button.dataset.pushAction === 'disable') {
    busy = true;
    error = '';
    changed();
    disconnectPush()
      .catch((err) => (error = err.message))
      .finally(() => {
        busy = false;
        changed();
      });
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && owner) syncPushAccount({ id: owner }, true);
});
window.addEventListener('online', () => {
  if (owner) syncPushAccount({ id: owner }, true);
});
