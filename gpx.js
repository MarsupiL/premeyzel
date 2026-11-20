// Geometry is deliberately independent of the storage provider and map renderer.
export const MAX_GPX_BYTES = 5 * 1024 * 1024;
export const MAX_TRACK_POINTS = 20000;
const xml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const number = (value) => typeof value === 'number' && Number.isFinite(value);
export function normalizeTrack(track) {
  if (
    !track ||
    !Array.isArray(track.segments) ||
    !track.segments.length ||
    track.segments.length > 200
  )
    throw new Error('Le fichier ne contient aucun tracé utilisable.');
  let count = 0;
  const point = (p) => {
    if (
      !Array.isArray(p) ||
      !number(p[0]) ||
      !number(p[1]) ||
      Math.abs(p[0]) > 85 ||
      Math.abs(p[1]) > 180
    )
      throw new Error(
        'Le tracé contient une coordonnée invalide ou hors de la zone cartographique.',
      );
    if (p[2] != null && (!number(p[2]) || p[2] < -500 || p[2] > 10000))
      throw new Error('Une altitude du tracé est invalide.');
    return [
      Math.round(p[0] * 1e7) / 1e7,
      Math.round(p[1] * 1e7) / 1e7,
      p[2] == null ? null : Math.round(p[2] * 10) / 10,
    ];
  };
  const segments = track.segments.map((segment) => {
    if (!Array.isArray(segment) || segment.length < 2)
      throw new Error('Chaque segment doit contenir au moins deux points.');
    count += segment.length;
    if (count > MAX_TRACK_POINTS)
      throw new Error('Le tracé dépasse 20 000 points. Simplifiez le fichier avant de l’importer.');
    return segment.map(point);
  });
  if (track.waypoints != null && (!Array.isArray(track.waypoints) || track.waypoints.length > 500))
    throw new Error('Le fichier contient trop de repères.');
  const waypoints = (track.waypoints || []).map((p) => ({
    point: point(p.point),
    name: String(p.name || 'Repère')
      .trim()
      .slice(0, 120),
  }));
  return { segments, waypoints };
}
export function distanceMetres(a, b) {
  const rad = Math.PI / 180,
    dlat = (b[0] - a[0]) * rad,
    dlon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function trackStats(track) {
  let distance = 0,
    ascent = 0,
    descent = 0,
    elevations = 0,
    pairs = 0,
    count = 0;
  for (const segment of track.segments) {
    count += segment.length;
    for (let i = 1; i < segment.length; i++) {
      distance += distanceMetres(segment[i - 1], segment[i]);
      pairs++;
      if (segment[i - 1][2] != null && segment[i][2] != null) {
        elevations++;
        const delta = segment[i][2] - segment[i - 1][2];
        ascent += Math.max(0, delta);
        descent += Math.max(0, -delta);
      }
    }
  }
  return {
    distance: Math.round(distance / 10) / 100,
    elevation: elevations === pairs ? Math.round(ascent) : null,
    descent: elevations === pairs ? Math.round(descent) : null,
    points: count,
    segments: track.segments.length,
    gap: Math.round(distanceMetres(track.segments[0][0], track.segments.at(-1).at(-1))),
  };
}
export function parseGPX(text, Parser = globalThis.DOMParser) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_GPX_BYTES)
    throw new Error('Le fichier GPX dépasse 5 Mo.');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(text))
    throw new Error('Ce fichier GPX contient une déclaration XML non prise en charge.');
  if (!Parser) throw new Error('Le navigateur ne peut pas lire ce fichier GPX.');
  let doc;
  try {
    doc = new Parser().parseFromString(text, 'application/xml');
  } catch {
    throw new Error('Le fichier GPX est illisible ou mal formé.');
  }
  if (
    !doc?.documentElement ||
    doc.getElementsByTagName('parsererror').length ||
    doc.documentElement.localName !== 'gpx'
  )
    throw new Error('Choisissez un fichier GPX valide.');
  const namespace = doc.documentElement.namespaceURI;
  if (
    namespace &&
    !['http://www.topografix.com/GPX/1/1', 'http://www.topografix.com/GPX/1/0'].includes(namespace)
  )
    throw new Error('Ce format GPX n’est pas reconnu.');
  const children = (node, name) =>
    Array.from(node.childNodes).filter(
      (n) => n.nodeType === 1 && n.localName === name && n.namespaceURI === namespace,
    );
  const child = (node, name) => children(node, name)[0];
  const value = (node, name) => child(node, name)?.textContent?.trim() || '';
  const coord = (node) => {
    const lat = node.getAttribute('lat'),
      lon = node.getAttribute('lon'),
      ele = value(node, 'ele');
    if (lat == null || lon == null || !lat.trim() || !lon.trim())
      throw new Error('Une coordonnée GPX est manquante.');
    return [Number(lat), Number(lon), ele ? Number(ele) : null];
  };
  const root = doc.documentElement,
    tracks = children(root, 'trk'),
    routes = children(root, 'rte');
  const segments = tracks
    .flatMap((t) => children(t, 'trkseg').map((s) => children(s, 'trkpt').map(coord)))
    .filter((s) => s.length);
  if (!segments.length)
    segments.push(...routes.map((r) => children(r, 'rtept').map(coord)).filter((s) => s.length));
  const waypoints = children(root, 'wpt').map((w) => ({
    point: coord(w),
    name: value(w, 'name') || 'Repère',
  }));
  const track = normalizeTrack({ segments, waypoints });
  const name =
    value(root, 'name') ||
    value(child(root, 'metadata') || root, 'name') ||
    (tracks[0] && value(tracks[0], 'name')) ||
    (routes[0] && value(routes[0], 'name')) ||
    '';
  return { name: name.slice(0, 100), track, ...trackStats(track) };
}
export function exportGPX(trail) {
  const track = normalizeTrack(trail.track);
  const point = (tag, p, name = '') =>
    `<${tag} lat="${p[0]}" lon="${p[1]}">${p[2] == null ? '' : `<ele>${p[2]}</ele>`}${name ? `<name>${xml(name)}</name>` : ''}</${tag}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Prémeyzel · Entre voisins" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(trail.title)}</name><desc>${xml(trail.description)}</desc></metadata>${track.waypoints.map((w) => point('wpt', w.point, w.name)).join('')}<trk><name>${xml(trail.title)}</name><type>${trail.activity === 'VTT' ? 'mountain_biking' : 'hiking'}</type>${track.segments.map((s) => `<trkseg>${s.map((p) => point('trkpt', p)).join('')}</trkseg>`).join('')}</trk></gpx>`;
}
export function gpxFilename(title) {
  return (
    (String(title)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'parcours') + '.gpx'
  );
}
