import { escapeHTML as esc } from './html.js';
import { normalizeSearch } from './search.js';
import { parseGPX, trackStats, exportGPX, gpxFilename, MAX_GPX_BYTES } from './gpx.js';
import { createTrailMap } from './trail-map.js';
import { mountHunting } from './hunting-ui.js';
import {
  TRAIL_API,
  fetchTrails,
  fetchTrail,
  publishTrail,
  removeSharedTrail,
  ownedTrailIds,
} from './trail-api.js';
import { preparePhoto, photoSource } from './photos.js';
import { cardArt } from './art.js';

const CACHE = 'premeyzel-shared-trails-v1';
let activeProfileName = '',
  residentMode = false,
  account = null,
  onRequireAuth = null,
  accountScope = null;
let root = null,
  items = [],
  selectedId = null,
  map = null,
  timer = null,
  hunting = null,
  etag = null,
  loading = false,
  query = '',
  filter = 'Tout',
  wantCompose = false,
  loadSerial = 0;
const details = new Map(),
  dialogs = new Set();
const activity = (p) => (p.activity === 'VTT' ? 'VTT' : 'Randonnée');
const stats = (p) =>
  `${p.distance} km · ${p.elevation == null ? 'Dénivelé non renseigné' : `+${p.elevation} m`}${p.duration ? ` · ${Math.floor(p.duration / 60)}h${String(p.duration % 60).padStart(2, '0')}` : ''}`;
const imageSrc = (photo) =>
  typeof photo === 'string' && photo.startsWith(TRAIL_API + '/api/trails/')
    ? photo
    : photoSource(photo);
const visual = (p) => {
  const src = imageSrc(p.photo);
  return `<span class="post-visual">${cardArt(p.activity === 'VTT' ? 'mountain' : 'forest')}${src ? `<img class="post-photo" alt="" src="${esc(src)}">` : ''}</span>`;
};
const byId = (id) => details.get(id) || items.find((p) => p.id === id);
function cache() {
  try {
    localStorage.setItem(
      CACHE,
      JSON.stringify({ items, details: [...details.entries()].slice(-20) }),
    );
  } catch {
    /* Shared storage remains authoritative; a full local cache must not block reads. */
  }
}
function notice(message, kind = '') {
  if (root) {
    const el = root.querySelector('.trails-sync');
    el.textContent = message;
    el.className = 'trails-sync notice ' + kind;
  }
}
function visible() {
  return items.filter(
    (p) =>
      (filter === 'Tout' || activity(p) === filter) &&
      normalizeSearch(`${p.title} ${p.description} ${p.authorName}`).includes(
        normalizeSearch(query),
      ),
  );
}
function updateList() {
  if (!root) return;
  const posts = visible();
  if (!posts.some((p) => p.id === selectedId)) selectedId = posts[0]?.id;
  root.querySelector('#trail-results').textContent =
    `${posts.length} parcours partagé${posts.length > 1 ? 's' : ''}`;
  root.querySelector('#shared-trail-list').innerHTML =
    posts
      .map(
        (p) =>
          `<article class="trail-card ${p.id === selectedId ? 'selected' : ''}"><button class="trail-select" data-trail="select" data-id="${p.id}" aria-pressed="${p.id === selectedId}"><span class="trail-thumbnail" aria-hidden="true">${visual(p)}</span><span><span class="badge plain">${activity(p)} · ${esc(p.difficulty)}</span><h3>${esc(p.title)}</h3><span class="trail-stats">${stats(p)}</span><span class="trail-author">Partagé par ${esc(p.authorName || 'un habitant')}</span></span></button><div class="trail-actions"><button class="text-link" data-trail="open" data-id="${p.id}">Voir le parcours</button><button class="text-link" data-trail="download" data-id="${p.id}" aria-label="Télécharger le GPX de ${esc(p.title)}">GPX</button></div></article>`,
      )
      .join('') || '<p class="notice">Aucun parcours ne correspond à votre recherche.</p>';
  updateSelected();
  map?.setTrails(
    posts.map((p) => byId(p.id)),
    selectedId,
    false,
  );
}
function updateSelected() {
  if (!root) return;
  const p = byId(selectedId);
  root.querySelector('#selected-trail').innerHTML = p
    ? `<div><span class="badge">${activity(p)}</span><h2>${esc(p.title)}</h2><p>${stats(p)}</p></div><div class="button-row"><button class="btn primary" data-trail="open" data-id="${p.id}">Ouvrir en plein écran</button><button class="btn secondary" data-trail="download" data-id="${p.id}">Télécharger le GPX</button></div>`
    : '<p>Sélectionnez un parcours sur la carte ou dans la liste.</p>';
}
async function fullTrail(id) {
  const serial = loadSerial;
  let p = byId(id);
  if (p && !p.preview) return p;
  const full = await fetchTrail(id);
  if (serial !== loadSerial) throw new Error('La vue du parcours a changé. Rouvrez-le.');
  details.set(id, full);
  cache();
  return full;
}
async function select(id) {
  selectedId = id;
  updateList();
  map?.setTrails(
    visible().map((p) => byId(p.id)),
    id,
    true,
  );
  try {
    await fullTrail(id);
    if (root && selectedId === id) {
      updateSelected();
      map?.setTrails(
        visible().map((p) => byId(p.id)),
        id,
        false,
      );
    }
  } catch (error) {
    notice(error.message, 'warning');
  }
}
async function refresh(force = false) {
  if (loading) return;
  loading = true;
  const serial = loadSerial;
  try {
    const data = await fetchTrails(force ? null : etag);
    if (serial !== loadSerial) return;
    if (data) {
      for (const p of data.trails) {
        const old = details.get(p.id);
        if (
          old &&
          (old.revision !== p.revision || old.canManage !== p.canManage || old.mine !== p.mine)
        )
          details.delete(p.id);
      }
      for (const id of details.keys())
        if (!data.trails.some((p) => p.id === id)) details.delete(id);
      items = data.trails;
      etag = data.etag;
      cache();
      if (root) {
        updateList();
        if (selectedId) await select(selectedId);
      }
    }
    notice('Parcours partagés · les nouvelles publications apparaissent automatiquement.');
  } catch (error) {
    if (serial !== loadSerial) return;
    notice(
      'Connexion indisponible · les parcours déjà chargés restent consultables. Les nouvelles publications nécessitent Internet.',
      'warning',
    );
  } finally {
    if (serial === loadSerial) loading = false;
  }
}
export async function mountTrails(
  element,
  {
    authorName = '',
    residentMode: real = false,
    account: viewer = null,
    onRequireAuth: login = null,
  } = {},
) {
  unmountTrails();
  residentMode = real;
  account = viewer;
  onRequireAuth = login;
  if (accountScope !== (viewer?.id || 'guest')) {
    details.clear();
    items = [];
    etag = null;
  }
  accountScope = viewer?.id || 'guest';
  activeProfileName = authorName;
  root = element;
  const serial = ++loadSerial;
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PRENDRE L’AIR</p><h1>Autour de chez nous</h1><p>Randonnées et VTT, partagés entre habitants.</p></div><div class="button-row trail-page-actions"><button class="btn primary" data-trail="compose">Importer un GPX</button>${residentMode ? '' : '<a class="btn secondary" href="' + TRAIL_API + '/admin" target="_blank" rel="noopener">Administration des parcours</a>'}</div></div><div class="trails-sync notice" role="status">Chargement des parcours partagés…</div><div class="trail-search-row"><label class="search-box"><span class="sr-only">Rechercher un parcours</span><input id="trail-search" type="search" placeholder="Rechercher un parcours…" value="${esc(query)}"></label><button class="btn secondary" data-trail="refresh">Actualiser</button></div><div class="filters" aria-label="Type de parcours">${['Tout', 'Randonnée', 'VTT'].map((value) => `<button class="chip ${value === filter ? 'selected' : ''}" aria-pressed="${value === filter}" data-trail="filter" data-value="${value}">${value}</button>`).join('')}</div><p id="trail-results" class="results-count"></p><div id="hunting-zones"></div><div class="trails-layout real-trails"><div id="shared-trail-list" class="trail-list"></div><section class="map-panel"><div id="shared-trail-map" class="real-trail-map" role="region" aria-label="Carte IGN des parcours avec courbes de niveau"></div><div id="selected-trail" class="selected-trail"></div></section></div><p class="trail-help">Cliquez sur un tracé pour l’ouvrir en plein écran. En plein écran, activez « Ma position » pour suivre votre progression. Le fond IGN et ses courbes de niveau nécessitent Internet.</p>${residentMode ? '' : '<p class="fine">L’administration permet de modifier ou retirer tous les parcours après connexion avec le compte administrateur. Les autres rubriques du pilote restent en démonstration locale.</p>'}`;
  root.addEventListener('click', handleClick);
  root.querySelector('#trail-search').addEventListener('input', (e) => {
    query = e.target.value;
    updateList();
  });
  if (!items.length) {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE));
      if (Array.isArray(saved?.items)) {
        items = saved.items.map((p) => ({ ...p, canManage: false, mine: false }));
        for (const [id, p] of saved.details || [])
          details.set(id, { ...p, canManage: false, mine: false });
      }
    } catch {}
  }
  if (!items.length && !residentMode) {
    try {
      const response = await fetch('./assets/trails/les-chataignes.json');
      const seed = await response.json();
      items = [seed];
      details.set(seed.id, seed);
    } catch {}
  }
  if (!root || serial !== loadSerial) return;
  const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('parcours');
  if (requested) selectedId = requested;
  selectedId = selectedId || items[0]?.id;
  updateList();
  map = createTrailMap(root.querySelector('#shared-trail-map'), {
    trails: visible().map((p) => byId(p.id)),
    selectedId,
    onSelect: select,
    onOpen: (id) => openRoute(id),
  });
  hunting = mountHunting(root.querySelector('#hunting-zones'), { account, onRequireAuth, dialog });
  hunting.attachMap(map);
  refresh(true);
  timer = setInterval(() => {
    if (!document.hidden && navigator.onLine) refresh();
  }, 10000);
  if (wantCompose || new URLSearchParams(location.hash.split('?')[1] || '').has('import')) {
    wantCompose = false;
    composeTrail();
  }
}
export function unmountTrails() {
  ++loadSerial;
  loading = false;
  if (timer) clearInterval(timer);
  timer = null;
  hunting?.destroy();
  hunting = null;
  map?.destroy();
  map = null;
  for (const dialog of [...dialogs]) dialog.closeView();
  root = null;
  activeProfileName = '';
}
export function requestTrailCompose() {
  if (root) composeTrail();
  else wantCompose = true;
}
async function handleClick(event) {
  const button = event.target.closest('[data-trail]');
  if (!button) return;
  const { trail: action, id, value } = button.dataset;
  try {
    if (action === 'compose') composeTrail();
    if (action === 'refresh') await Promise.all([refresh(true), hunting?.refresh()]);
    if (action === 'filter') {
      filter = value;
      for (const b of root.querySelectorAll('[data-trail="filter"]')) {
        b.classList.toggle('selected', b.dataset.value === value);
        b.setAttribute('aria-pressed', String(b.dataset.value === value));
      }
      updateList();
      map?.fit();
    }
    if (action === 'select') await select(id);
    if (action === 'open') await openRoute(id);
    if (action === 'download') downloadGPX(await fullTrail(id));
  } catch (error) {
    notice(error.message, 'warning');
  }
}
function dialog(title, body, fullscreen = false) {
  const focus = document.activeElement,
    d = document.createElement('dialog');
  d.className = fullscreen ? 'modal trail-fullscreen' : 'modal wide trail-dialog';
  d.setAttribute('aria-label', title);
  d.innerHTML = `<header class="modal-header"><h2>${esc(title)}</h2><button class="icon-button" type="button" data-trail-close aria-label="Fermer">✕</button></header><div class="modal-body">${body}</div>`;
  d.closeView = () => {
    if (!d.isConnected) return;
    d.onCleanup?.();
    d.close();
    d.remove();
    dialogs.delete(d);
    if (focus?.isConnected) focus.focus();
  };
  d.querySelector('[data-trail-close]').onclick = d.closeView;
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    d.closeView();
  });
  document.body.append(d);
  dialogs.add(d);
  d.showModal();
  return d;
}
function downloadGPX(p) {
  const blob = new Blob([exportGPX(p)], { type: 'application/gpx+xml' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = gpxFilename(p.title);
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function shareGPX(p, status) {
  const file = new File([exportGPX(p)], gpxFilename(p.title), { type: 'application/gpx+xml' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: p.title });
    } catch (error) {
      if (error.name !== 'AbortError') {
        downloadGPX(p);
        status.textContent =
          'GPX téléchargé. Ouvrez-le depuis vos téléchargements dans une application compatible.';
      }
    }
  } else {
    downloadGPX(p);
    status.textContent =
      'GPX téléchargé. Ouvrez-le depuis vos téléchargements dans une application compatible (par exemple une application de randonnée).';
  }
}
async function openRoute(id) {
  const serial = loadSerial;
  notice('Chargement du parcours…');
  try {
    const p = await fullTrail(id);
    if (serial !== loadSerial || !root) return;
    notice('Parcours partagés · les nouvelles publications apparaissent automatiquement.');
    openMap(p);
  } catch (error) {
    notice(error.message, 'warning');
  }
}
function openMap(p) {
  const own = residentMode ? !!account && p.canManage === true : ownedTrailIds().includes(p.id),
    d = dialog(
      p.title,
      `<div class="fullscreen-route-summary"><span class="badge">${activity(p)}</span><strong>${stats(p)}</strong><span>${esc(p.difficulty)}</span><button class="btn secondary" type="button" data-export>Exporter GPX</button><button class="btn primary" type="button" data-share>Ouvrir dans une app</button>${own ? '<button class="btn secondary" type="button" data-edit>Modifier</button><button class="btn secondary" type="button" data-remove>Retirer</button>' : ''}${residentMode ? '' : '<a class="btn secondary" href="' + TRAIL_API + '/admin" target="_blank" rel="noopener">Administration des parcours</a>'}</div><div class="fullscreen-map" role="region" aria-label="Carte plein écran du parcours avec courbes de niveau"></div><div class="fullscreen-foot"><p class="share-status" role="status"></p></div>`,
      true,
    );
  const fullMap = createTrailMap(d.querySelector('.fullscreen-map'), {
    trails: [p],
    selectedId: p.id,
    tracking: true,
  });
  const detachHunting = hunting?.attachMap(fullMap);
  d.onCleanup = () => {
    detachHunting?.();
    fullMap.destroy();
  };
  d.querySelector('[data-export]').onclick = () => downloadGPX(p);
  d.querySelector('[data-share]').onclick = () => shareGPX(p, d.querySelector('.share-status'));
  if (own) {
    d.querySelector('[data-edit]').onclick = () => {
      d.closeView();
      composeTrail(p);
    };
    d.querySelector('[data-remove]').onclick = () => confirmRemoval(p, d);
  }
}
function confirmRemoval(p, source) {
  const d = dialog(
    'Retirer ce parcours ?',
    `<p>« ${esc(p.title)} » ne sera plus visible par les autres habitants.</p><p class="form-error" role="alert"></p><div class="form-footer"><button class="btn secondary" data-cancel>Conserver</button><button class="btn danger-fill" data-confirm>Retirer le parcours</button></div>`,
  );
  d.querySelector('[data-cancel]').onclick = d.closeView;
  d.querySelector('[data-confirm]').onclick = async () => {
    const b = d.querySelector('[data-confirm]');
    b.disabled = true;
    try {
      await removeSharedTrail(p);
      d.closeView();
      source.closeView();
      details.delete(p.id);
      await refresh(true);
    } catch (error) {
      d.querySelector('.form-error').textContent = error.message;
      b.disabled = false;
    }
  };
}
function selectField(label, name, choices, value) {
  return `<label><span class="field-label">${label}</span><span class="select-control"><select name="${name}">${choices.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="select-value" aria-hidden="true">${choices.find((c) => c[0] === value)?.[1] || choices[0][1]}</span></span></label>`;
}
function composeTrail(existing) {
  if (residentMode && !account) {
    onRequireAuth?.();
    return;
  }
  const p = existing || {},
    draft = {
      id: p.id || crypto.randomUUID(),
      authorName: existing ? p.authorName || '' : activeProfileName,
      track: p.track || null,
      photo: p.photo || null,
      busy: 0,
      revision: p.revision,
    };
  let previewMap = null,
    gpxRequest = 0,
    photoRequest = 0;
  const d = dialog(
    existing ? 'Modifier le parcours' : 'Partager un parcours GPX',
    `<form id="trail-publish-form"><p class="fine">Partagé par <strong>${esc(draft.authorName || 'un habitant')}</strong></p><p class="notice soft">Votre parcours sera visible par tous les habitants dès sa publication. ${residentMode ? 'Vous pourrez le gérer depuis votre compte sur tous vos appareils. Les administrateurs peuvent aussi le modifier ou le retirer.' : 'Sa gestion sera liée à ce navigateur ; l’administrateur peut aussi le modifier ou le retirer.'}</p><label class="gpx-picker"><span class="field-label">${existing ? 'Remplacer le GPX (facultatif)' : 'Fichier GPX'}</span><input id="trail-gpx" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" ${existing ? '' : 'required'} aria-describedby="gpx-help gpx-feedback"></label><p id="gpx-help" class="fine">5 Mo maximum · 20 000 points. Le tracé, ses altitudes et ses repères seront publics. Les horaires enregistrés et les autres métadonnées personnelles ne sont pas publiés.</p><p id="gpx-feedback" role="status"></p><div class="gpx-preview" hidden role="region" aria-label="Aperçu du GPX importé"></div><button class="btn secondary" type="button" data-preview ${draft.track ? '' : 'hidden'}>Aperçu plein écran</button><label>Titre<input name="title" value="${esc(p.title || '')}" minlength="4" maxlength="100" required></label><div class="form-grid">${selectField(
      'Activité',
      'activity',
      [
        ['Marche', 'Randonnée'],
        ['VTT', 'VTT'],
      ],
      p.activity || 'Marche',
    )}${selectField(
      'Difficulté',
      'difficulty',
      ['À évaluer', 'Facile', 'Modéré', 'Sportif'].map((s) => [s, s]),
      p.difficulty || 'À évaluer',
    )}<label>Durée estimée en minutes (facultative)<input name="duration" type="number" min="1" max="10000" value="${p.duration || ''}"></label></div><label>Lieu<input name="location" value="${esc(p.location || 'Prémeyzel')}" maxlength="120" required></label><label>Description (facultative)<textarea name="description" rows="3" maxlength="2000" placeholder="Départ, terrain, points à connaître…">${esc(p.description || '')}</textarea></label><fieldset class="photo-editor"><legend>Photo (facultative)</legend><div class="photo-preview">${visual(p)}</div><label class="photo-file-label">Ajouter ou remplacer la photo<input id="trail-photo" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="btn secondary" type="button" data-photo-remove ${draft.photo ? '' : 'hidden'}>Retirer la photo</button><p class="fine">JPEG, PNG ou WebP · 10 Mo maximum. Une illustration s’affiche sans photo.</p></fieldset><p class="form-error" role="alert" tabindex="-1"></p><div class="form-footer"><button type="button" class="btn secondary" data-cancel>Annuler</button><button type="submit" class="btn primary">${existing ? 'Enregistrer les modifications' : 'Publier pour tous'}</button></div></form>`,
  );
  const form = d.querySelector('form'),
    error = d.querySelector('.form-error'),
    submit = form.querySelector('[type="submit"]');
  const updateBusy = () => (submit.disabled = draft.busy > 0);
  const showPreview = () => {
    const el = d.querySelector('.gpx-preview');
    el.hidden = false;
    previewMap?.destroy();
    const s = trackStats(draft.track);
    previewMap = createTrailMap(el, {
      trails: [
        { ...draft, ...s, title: 'Aperçu du parcours', activity: form.elements.activity.value },
      ],
      selectedId: draft.id,
    });
    d.querySelector('#gpx-feedback').textContent =
      `${s.points} points · ${s.distance} km · ${s.elevation == null ? 'altitudes manquantes' : `+${s.elevation} m`}${s.gap > 100 ? ` · départ et arrivée distants de ${s.gap} m` : ''}`;
    d.querySelector('[data-preview]').hidden = false;
  };
  d.onCleanup = () => previewMap?.destroy();
  d.querySelector('[data-cancel]').onclick = d.closeView;
  d.querySelector('#trail-gpx').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const request = ++gpxRequest;
    draft.busy++;
    updateBusy();
    error.textContent = '';
    try {
      if (!/\.gpx$/i.test(file.name))
        throw new Error('Choisissez un fichier portant l’extension .gpx.');
      if (file.size > MAX_GPX_BYTES) throw new Error('Le fichier GPX dépasse 5 Mo.');
      const parsed = parseGPX(await file.text());
      if (!d.isConnected || request !== gpxRequest) return;
      draft.track = parsed.track;
      if (!form.elements.title.value)
        form.elements.title.value = parsed.name || file.name.replace(/\.gpx$/i, '');
      showPreview();
    } catch (err) {
      error.textContent = err.message;
      e.target.value = '';
    } finally {
      draft.busy--;
      if (d.isConnected) updateBusy();
    }
  };
  d.querySelector('#trail-photo').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const request = ++photoRequest;
    draft.busy++;
    updateBusy();
    error.textContent = '';
    try {
      const photo = await preparePhoto(file);
      if (!d.isConnected || request !== photoRequest) return;
      draft.photo = photo;
      d.querySelector('.photo-preview').innerHTML = visual({ photo });
      d.querySelector('[data-photo-remove]').hidden = false;
    } catch (err) {
      error.textContent = err.message;
    } finally {
      draft.busy--;
      e.target.value = '';
      if (d.isConnected) updateBusy();
    }
  };
  d.querySelector('[data-photo-remove]').onclick = () => {
    photoRequest++;
    draft.photo = null;
    d.querySelector('.photo-preview').innerHTML = visual({});
    d.querySelector('[data-photo-remove]').hidden = true;
  };
  const payload = () => ({
    ...Object.fromEntries(new FormData(form)),
    ...draft,
    duration: form.elements.duration.value ? Number(form.elements.duration.value) : null,
    ...(draft.track ? trackStats(draft.track) : {}),
  });
  d.querySelector('[data-preview]').onclick = () => {
    if (draft.track)
      openMap({ ...payload(), title: form.elements.title.value || 'Aperçu du parcours' });
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (draft.busy) return;
    error.textContent = '';
    if (!draft.track) {
      error.textContent = 'Importez un fichier GPX pour publier ce parcours.';
      return;
    }
    draft.busy++;
    updateBusy();
    try {
      const saved = await publishTrail(payload(), existing?.id);
      details.set(saved.id, saved);
      selectedId = saved.id;
      d.closeView();
      await refresh(true);
      notice('Parcours publié : il est maintenant disponible pour tous.');
    } catch (err) {
      error.textContent = err.message;
      error.focus();
    } finally {
      draft.busy--;
      if (d.isConnected) updateBusy();
    }
  };
  if (draft.track) showPreview();
}
