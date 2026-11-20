import { request } from './api-client.js';
import { escapeHTML as esc } from './html.js';
import { createHuntingFeed, zonePhase, zoneCountdown } from './hunting-state.js';
import { createTrailMap } from './trail-map.js';

const date = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
const localInput = (value) => {
  const d = new Date(value);
  return new Date(value - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const guidance =
  'Zones signalées par les habitants. L’absence de signalement ne garantit pas l’absence de chasse. Respectez les panneaux sur place.';
export function mountHunting(element, { account, onRequireAuth, dialog } = {}) {
  let destroyed = false,
    listSignature = '';
  const maps = new Set(),
    views = new Map(),
    ownedDialogs = new Set();
  element.innerHTML = `<section class="hunting-panel" aria-labelledby="hunting-title"><div class="hunting-heading"><div><h2 id="hunting-title">Zones de chasse</h2><p>Repérez les secteurs à éviter pendant votre balade.</p></div><button class="btn secondary" type="button" data-hunting-create>Signaler une zone</button></div><p class="hunting-status" role="status">Chargement des zones…</p><div class="hunting-list"></div><p class="hunting-guidance">${guidance}</p></section>`;
  const status = element.querySelector('.hunting-status'),
    list = element.querySelector('.hunting-list');
  const feed = createHuntingFeed({ onChange: render });
  function makeDialog(title, body) {
    const d = dialog(title, body);
    ownedDialogs.add(d);
    d.onCleanup = () => ownedDialogs.delete(d);
    return d;
  }
  function render(state) {
    if (destroyed) return;
    status.textContent = state.stale
      ? state.loaded
        ? 'Informations non actualisées : la carte peut être incomplète. Reconnectez-vous pour vérifier les zones.'
        : 'Zones non vérifiées. Une connexion est nécessaire pour les afficher.'
      : state.zones.length
        ? 'Rouge : chasse en cours · Pointillés : chasse prévue. Horaires de Paris.'
        : 'Aucune zone de chasse signalée actuellement.';
    status.classList.toggle('warning', state.stale);
    const signature = state.zones
      .map((z) => `${z.id}:${z.revision}:${z.canManage}:${zonePhase(z, state.now)}`)
      .join('|');
    if (signature !== listSignature) {
      listSignature = signature;
      list.innerHTML = state.zones
        .map(
          (z) =>
            `<article class="hunting-card ${zonePhase(z, state.now)}"><div><span class="hunting-phase">${zonePhase(z, state.now) === 'active' ? 'Chasse en cours' : 'Chasse prévue'}</span><h3>${esc(z.title)}</h3><strong data-zone-countdown="${esc(z.id)}"></strong><p>Du ${esc(date(z.startsAt))} au ${esc(date(z.endsAt))}<br>Signalée par ${esc(z.authorName)}</p></div><button class="btn secondary" type="button" data-hunting-view="${esc(z.id)}">Voir la zone</button></article>`,
        )
        .join('');
    }
    for (const el of list.querySelectorAll('[data-zone-countdown]')) {
      const zone = state.zones.find((z) => z.id === el.dataset.zoneCountdown);
      if (zone) el.textContent = zoneCountdown(zone, state.now);
    }
    for (const map of maps) map.setHuntingZones(state.zones, state.now, state.stale, showZone);
    for (const [id, view] of views) {
      const current = state.zones.find((z) => z.id === id);
      if (!current || current.revision !== view.revision) {
        view.dialog.closeView();
        status.textContent = !current
          ? 'Cette zone a expiré ou a été retirée.'
          : 'Cette zone a été modifiée. Ouvrez-la à nouveau pour consulter sa mise à jour.';
      } else view.countdown.textContent = zoneCountdown(current, state.now);
    }
  }
  function attachMap(map) {
    maps.add(map);
    const s = feed.snapshot();
    map.setHuntingZones(s.zones, s.now, s.stale, showZone);
    return () => maps.delete(map);
  }
  function showZone(id) {
    if (views.has(id)) return;
    const zone = feed.snapshot().zones.find((z) => z.id === id);
    if (!zone) return;
    const d = makeDialog(
      zone.title,
      `<div class="hunting-detail"><strong class="hunting-countdown"></strong><p>Du ${esc(date(zone.startsAt))} au ${esc(date(zone.endsAt))} · heure de Paris</p><p>Signalée par ${esc(zone.authorName)}</p>${zone.description ? `<p class="hunting-description">${esc(zone.description)}</p>` : ''}<div class="hunting-detail-map" role="region" aria-label="Emplacement de la zone de chasse"></div><p class="hunting-guidance">${guidance}</p>${account && zone.canManage ? '<div class="button-row"><button class="btn secondary" type="button" data-zone-edit>Modifier</button><button class="btn secondary" type="button" data-zone-remove>Retirer la zone</button></div>' : ''}</div>`,
    );
    const map = createTrailMap(d.querySelector('.hunting-detail-map')),
      detach = attachMap(map);
    map.focusZone(id);
    const countdown = d.querySelector('.hunting-countdown');
    countdown.textContent = zoneCountdown(zone, feed.now());
    views.set(id, { dialog: d, revision: zone.revision, countdown });
    d.onCleanup = () => {
      detach();
      map.destroy();
      views.delete(id);
      ownedDialogs.delete(d);
    };
    d.querySelector('[data-zone-edit]')?.addEventListener('click', () => {
      d.closeView();
      compose(zone);
    });
    d.querySelector('[data-zone-remove]')?.addEventListener('click', () => remove(zone, d));
  }
  function remove(zone, source) {
    const d = makeDialog(
      'Retirer cette zone ?',
      `<p>« ${esc(zone.title)} » ne sera plus visible sur la carte.</p><p class="form-error" role="alert"></p><div class="form-footer"><button class="btn secondary" type="button" data-cancel>Conserver</button><button class="btn danger-fill" type="button" data-confirm>Retirer la zone</button></div>`,
    );
    d.querySelector('[data-cancel]').onclick = d.closeView;
    const button = d.querySelector('[data-confirm]');
    button.onclick = async () => {
      button.disabled = true;
      try {
        await request('hunting-zones/' + zone.id, {
          method: 'DELETE',
          body: { revision: zone.revision },
        });
        if (destroyed) return;
        d.closeView();
        source.closeView();
        await feed.refresh(true);
      } catch (error) {
        if (d.isConnected) {
          d.querySelector('.form-error').textContent = error.message;
          button.disabled = false;
        }
      }
    };
  }
  function compose(existing) {
    if (!account) {
      onRequireAuth?.();
      return;
    }
    const id = existing?.id || crypto.randomUUID(),
      now = feed.now();
    let polygon = existing?.polygon || [],
      closed = polygon.length >= 3,
      busy = false;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const d = makeDialog(
      existing ? 'Modifier la zone de chasse' : 'Signaler une zone de chasse',
      `<form class="hunting-form"><p>Posez les points du contour sur la carte, puis fermez la zone. Faites glisser un point pour l’ajuster.</p><div class="hunting-draw-map" role="region" aria-label="Dessiner le contour de la zone de chasse" tabindex="0"></div><div class="hunting-draw-actions"><button class="btn secondary" type="button" data-draw="finish">Fermer la zone</button><button class="btn secondary" type="button" data-draw="undo">Annuler le dernier point</button><button class="btn secondary" type="button" data-draw="reset">Recommencer</button><button class="btn secondary" type="button" data-draw="centre">Ajouter le point central</button></div><p class="hunting-draw-status" role="status"></p><p class="fine">Vous pouvez aussi déplacer la carte avec les flèches du clavier, puis ajouter son point central. 200 points maximum.</p><label>Nom du secteur<input name="title" required minlength="3" maxlength="100" value="${esc(existing?.title || '')}" placeholder="Ex. Bois des Châtaignes"></label><div class="form-grid"><label>Début<input name="startsAt" type="datetime-local" required value="${localInput(existing?.startsAt || now)}"></label><label>Fin<input name="endsAt" type="datetime-local" required value="${localInput(existing?.endsAt || now + 3 * 3600000)}"></label></div><p class="fine">Saisie à l’heure de votre appareil (${esc(timezone)}). Durée maximale : 7 jours ; début dans les 30 prochains jours. La zone disparaît automatiquement à la fin prévue.</p><label>Précisions (facultatives)<textarea name="description" maxlength="1000" rows="3" placeholder="Accès concernés, repères sur place…">${esc(existing?.description || '')}</textarea></label><p class="notice soft">Le contour et les horaires seront publics. Seuls vous et les administrateurs pourrez modifier ou retirer cette zone.</p><p class="form-error" role="alert" tabindex="-1"></p><div class="form-footer"><button class="btn secondary" type="button" data-cancel>Annuler</button><button class="btn primary" type="submit">${existing ? 'Enregistrer les modifications' : 'Publier la zone'}</button></div></form>`,
    );
    const form = d.querySelector('form'),
      error = d.querySelector('.form-error'),
      submit = form.querySelector('[type="submit"]');
    const map = createTrailMap(d.querySelector('.hunting-draw-map'));
    const editor = map.editPolygon({
      polygon,
      onChange(state) {
        polygon = state.points;
        closed = state.closed;
        d.querySelector('.hunting-draw-status').textContent = closed
          ? `Zone fermée · ${polygon.length} points. Vous pouvez ajuster ses sommets.`
          : `${polygon.length} point${polygon.length > 1 ? 's' : ''} placé${polygon.length > 1 ? 's' : ''} · ${polygon.length < 3 ? '3 points minimum.' : 'Fermez la zone pour continuer.'}`;
        d.querySelector('[data-draw="finish"]').disabled = closed || polygon.length < 3;
        d.querySelector('[data-draw="undo"]').disabled = !polygon.length;
        d.querySelector('[data-draw="reset"]').disabled = !polygon.length;
        d.querySelector('[data-draw="centre"]').disabled = closed || polygon.length >= 200;
        submit.disabled = !closed || busy;
      },
    });
    if (!editor) {
      submit.disabled = true;
      error.textContent = 'La carte est indisponible. Rechargez la page pour dessiner une zone.';
    }
    d.onCleanup = () => {
      map.destroy();
      ownedDialogs.delete(d);
    };
    d.querySelector('[data-cancel]').onclick = d.closeView;
    for (const b of d.querySelectorAll('[data-draw]'))
      b.onclick = () => {
        if (!busy) editor?.[b.dataset.draw === 'centre' ? 'addCentre' : b.dataset.draw]();
      };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy || !closed) return;
      error.textContent = '';
      const startsAt = new Date(form.elements.startsAt.value).getTime(),
        endsAt = new Date(form.elements.endsAt.value).getTime();
      if (
        !Number.isSafeInteger(startsAt) ||
        !Number.isSafeInteger(endsAt) ||
        endsAt <= startsAt ||
        endsAt <= feed.now()
      ) {
        error.textContent = 'Choisissez une fin à venir, après le début.';
        error.focus();
        return;
      }
      busy = true;
      submit.disabled = true;
      try {
        await request('hunting-zones' + (existing ? '/' + id : ''), {
          method: existing ? 'PATCH' : 'POST',
          body: {
            id,
            revision: existing?.revision,
            title: form.elements.title.value,
            description: form.elements.description.value,
            polygon,
            startsAt,
            endsAt,
          },
        });
        if (destroyed) return;
        d.closeView();
        await feed.refresh(true);
        for (const map of maps) map.focusZone(id);
      } catch (err) {
        if (d.isConnected) {
          error.textContent = err.message;
          error.focus();
        }
      } finally {
        busy = false;
        if (d.isConnected) submit.disabled = !closed;
      }
    };
  }
  const click = (event) => {
    if (event.target.closest('[data-hunting-create]')) compose();
    const view = event.target.closest('[data-hunting-view]');
    if (view) showZone(view.dataset.huntingView);
  };
  element.addEventListener('click', click);
  const resume = () => {
    if (!document.hidden) {
      feed.markStale();
      feed.refresh();
    }
  };
  const offline = () => feed.markStale();
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  const refreshTimer = setInterval(() => {
    if (!document.hidden) feed.refresh();
  }, 10000);
  const countdownTimer = setInterval(() => {
    if (!document.hidden) feed.tick();
  }, 1000);
  feed.refresh();
  return {
    attachMap,
    refresh: () => feed.refresh(),
    destroy() {
      destroyed = true;
      feed.destroy();
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      element.removeEventListener('click', click);
      for (const d of [...ownedDialogs]) d.closeView();
      maps.clear();
    },
  };
}
