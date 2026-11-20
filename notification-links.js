const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = 'premeyzel-notification-destination-v1';

export function notificationDestination(hash) {
  const [route, query] = String(hash || '').split('?');
  const params = new URLSearchParams(query || '');
  const key = route === '#/messages' ? 'c' : route === '#/evenements' ? 'event' : '';
  const id = params.get(key);
  return key && ID.test(id || '') ? `${route}?${key}=${id}` : '';
}

export function rememberNotificationDestination(hash = location.hash) {
  const destination =
    notificationDestination(hash) ||
    (hash.startsWith('#/connexion?')
      ? notificationDestination(new URLSearchParams(hash.split('?')[1]).get('next'))
      : '');
  try {
    if (destination)
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ destination, expires: Date.now() + 30 * 60 * 1000 }),
      );
    else sessionStorage.removeItem(KEY);
  } catch {}
}

export function takeNotificationDestination() {
  const current = notificationDestination(location.hash);
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    return (
      current || (stored?.expires > Date.now() ? notificationDestination(stored.destination) : '')
    );
  } catch {
    return current;
  }
}
