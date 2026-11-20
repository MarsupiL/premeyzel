import { API_BASE, requestWithMetadata } from './api-client.js';
export const TRAIL_API = API_BASE;
let residentMode = false,
  account = null;
export function setTrailAccount(user) {
  residentMode = true;
  account = user;
}
export function hasLegacyTrails() {
  try {
    return (
      /^[a-f0-9]{64}$/.test(localStorage.getItem('premeyzel-trail-owner-v1') || '') &&
      !localStorage.getItem('premeyzel-legacy-claimed')
    );
  } catch {
    return false;
  }
}
export async function claimLegacyTrails() {
  if (!account) throw new Error('Connectez-vous pour continuer.');
  const result = await request('trails/claim', {
    method: 'POST',
    headers: { 'X-Legacy-Owner-Key': localStorage.getItem(KEY) || '' },
  });
  localStorage.setItem('premeyzel-legacy-claimed', 'true');
  return result.data;
}
const KEY = 'premeyzel-trail-owner-v1',
  OWNED = 'premeyzel-owned-trails-v1';
export function ownedTrailIds() {
  try {
    return JSON.parse(localStorage.getItem(OWNED)) || [];
  } catch {
    return [];
  }
}
function ownerKey() {
  let key = localStorage.getItem(KEY);
  if (!/^[a-f0-9]{64}$/.test(key || '')) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem(KEY, key);
  }
  return key;
}
const request = requestWithMetadata;
export async function fetchTrails(etag) {
  const first = await request('trails', { headers: etag ? { 'If-None-Match': etag } : {} });
  if (!first) return null;
  const trails = first.data.trails;
  let offset = first.data.nextOffset;
  while (offset != null) {
    const next = await request('trails?offset=' + offset);
    trails.push(...next.data.trails);
    offset = next.data.nextOffset;
  }
  return { trails, etag: first.etag };
}
export async function fetchTrail(id) {
  return (await request('trails/' + encodeURIComponent(id))).data;
}
export async function publishTrail(data, id) {
  if (residentMode) {
    if (!account) throw new Error('Connectez-vous pour publier un parcours.');
    return (
      await request(id ? 'trails/' + id : 'trails', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    ).data;
  }
  const key = ownerKey(),
    ids = ownedTrailIds();
  // Reserve ownership locally before sending, so a lost response remains recoverable.
  if (!ids.includes(data.id)) {
    ids.push(data.id);
    localStorage.setItem(OWNED, JSON.stringify(ids));
  }
  return (
    await request(id ? 'trails/' + id : 'trails', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(data),
    })
  ).data;
}
export async function removeSharedTrail(trail) {
  if (residentMode && !account) throw new Error('Connectez-vous pour continuer.');
  return (
    await request('trails/' + trail.id, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(residentMode ? {} : { Authorization: 'Bearer ' + ownerKey() }),
      },
      body: JSON.stringify({ revision: trail.revision }),
    })
  ).data;
}
