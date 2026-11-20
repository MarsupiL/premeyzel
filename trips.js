import { escapeHTML as esc } from './html.js';
import { normalizeSearch } from './search.js';
import { icon } from './icons.js';

export function parisDateTime(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const tripLabel = (trip) =>
  trip.rideType === 'request' ? 'Recherche un trajet' : 'Propose un trajet';
const tripBadge = (trip) =>
  `<span class="badge ${trip.rideType === 'request' ? 'amber' : ''}">${tripLabel(trip)}</span>`;
const tripDate = (trip) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(trip.date.slice(0, 10) + 'T12:00:00Z'));
const schedule = (trip) =>
  `<time datetime="${esc(trip.date)}">${esc(tripDate(trip))} à <strong>${esc(trip.date.slice(11))}</strong></time>`;

export function selectTrips(trips, filter = 'Tout', query = '', now = new Date()) {
  const current = parisDateTime(now);
  return trips
    .filter(
      (trip) =>
        (filter === 'Passés' ? trip.date < current : trip.date >= current) &&
        (filter !== 'Propositions' || trip.rideType === 'offer') &&
        (filter !== 'Recherches' || trip.rideType === 'request') &&
        normalizeSearch(`${trip.destination} ${trip.authorName}`).includes(normalizeSearch(query)),
    )
    .sort(
      (a, b) =>
        (filter === 'Passés' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
        a.id.localeCompare(b.id),
    );
}

export function tripsPage(trips, { filter, query, loading }) {
  const selected = selectTrips(trips, filter, query);
  const cards = selected
    .map(
      (trip) =>
        `<article class="ride-card"><div class="ride-card-main"><div class="ride-badges">${tripBadge(trip)}${trip.mine ? '<span class="badge plain">Votre trajet</span>' : ''}</div><h2><button class="title-button" data-action="detail" data-id="${trip.id}">${icon('pin')}Vers ${esc(trip.destination)}</button></h2><p class="ride-schedule">${icon('calendar')}${schedule(trip)}</p><p class="ride-author">Partagé par ${esc(trip.authorName || 'Un habitant')}</p></div><button class="btn secondary" data-action="detail" data-id="${trip.id}">${trip.canManage ? 'Voir et gérer' : 'Voir le trajet'}</button></article>`,
    )
    .join('');
  return `<section class="rides-page"><div class="page-heading"><div><p class="eyebrow">FAIRE UN BOUT DE CHEMIN</p><h1>Les trajets entre voisins</h1><p>Une place à proposer ou un trajet à trouver ? Partagez votre destination.</p></div><button class="btn primary" data-action="compose" data-kind="trips">${icon('plus')}Publier un trajet</button></div><p class="notice soft">${icon('chat')}Écrivez à l’auteur pour convenir du lieu de départ et des détails du trajet.</p><label class="search-box">${icon('search')}<span class="sr-only">Rechercher une destination ou un habitant</span><input id="search" type="search" placeholder="Rechercher une destination…" value="${esc(query)}"></label><div class="filters" aria-label="Filtrer les trajets">${['Tout', 'Propositions', 'Recherches', 'Passés'].map((value) => `<button class="chip ${filter === value ? 'selected' : ''}" data-action="filter" data-value="${value}" aria-pressed="${filter === value}">${value === 'Tout' ? 'Tous les trajets à venir' : value}</button>`).join('')}</div><p class="results-count" role="status">${loading ? 'Chargement des trajets…' : `${selected.length} trajet${selected.length > 1 ? 's' : ''} ${filter === 'Passés' ? 'passé' + (selected.length > 1 ? 's' : '') : 'à venir'}`}</p><p class="ride-timezone">Dates et heures locales de Prémeyzel.</p>${loading ? '' : selected.length ? `<div class="ride-list">${cards}</div>` : `<div class="empty">${icon('car')}<h3>${query || filter !== 'Tout' ? 'Aucun trajet ne correspond' : 'On partage le prochain trajet ?'}</h3><p>${query || filter !== 'Tout' ? 'Essayez une autre destination ou retirez les filtres.' : 'Proposez votre trajet ou indiquez celui que vous cherchez.'}</p>${query || filter !== 'Tout' ? '<button class="btn secondary" data-action="reset-search">Effacer la recherche et les filtres</button>' : ''}</div>`}</section>`;
}

export function tripFields(trip = {}) {
  return `<fieldset class="ride-type"><legend>Votre trajet</legend><label><input type="radio" name="rideType" value="offer" ${trip.rideType !== 'request' ? 'checked' : ''} required>Je propose un trajet</label><label><input type="radio" name="rideType" value="request" ${trip.rideType === 'request' ? 'checked' : ''} required>Je cherche un trajet</label></fieldset><label>Destination<input name="destination" value="${esc(trip.destination || '')}" placeholder="Belley, gare de Culoz…" maxlength="120" required></label><div class="form-grid"><label>Date<input type="date" name="date" min="${parisDateTime().slice(0, 10)}" value="${esc(trip.date?.slice(0, 10) || '')}" required></label><label>Heure<input type="time" name="tripTime" value="${esc(trip.date?.slice(11) || '')}" required></label></div><p class="fine">À l’heure de Prémeyzel. Les habitants pourront vous écrire dans l’application pour organiser le trajet.</p>`;
}

export function tripDetail(trip) {
  return `<div class="ride-detail"><div class="detail-top">${tripBadge(trip)}<span class="author">Partagé par ${esc(trip.authorName || 'Un habitant')}</span></div><p class="ride-destination">${icon('pin')}Destination : <strong>${esc(trip.destination)}</strong></p><p class="ride-schedule">${icon('calendar')}${schedule(trip)}</p><p class="ride-timezone">Heure locale de Prémeyzel.</p>${trip.date < parisDateTime() ? '<p class="notice">Ce trajet est passé.</p>' : '<p>Le lieu de départ et les autres détails se conviennent directement par message.</p>'}</div>`;
}
