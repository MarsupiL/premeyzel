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
  const current = now.getTime();
  return trips
    .filter(
      (trip) =>
        trip.departureAt > current &&
        (filter !== 'Propositions' || trip.rideType === 'offer') &&
        (filter !== 'Recherches' || trip.rideType === 'request') &&
        normalizeSearch(`${trip.destination} ${trip.authorName}`).includes(normalizeSearch(query)),
    )
    .sort((a, b) => a.departureAt - b.departureAt || a.id.localeCompare(b.id));
}

export function tripsPage(trips, { filter, query, loading }) {
  const selected = selectTrips(trips, filter, query);
  const cards = selected
    .map(
      (trip) =>
        `<article class="ride-card"><div class="ride-card-main"><div class="ride-badges">${tripBadge(trip)}${trip.mine ? '<span class="badge plain">Votre trajet</span>' : ''}</div><h2><button class="title-button" data-action="detail" data-id="${trip.id}">${icon('pin')}Vers ${esc(trip.destination)}</button></h2>${trip.recurrence ? `<p class="ride-recurring">${icon('repeat')}${esc(recurrenceText(trip))}</p><p class="ride-timezone">Prochain départ</p>` : ''}<p class="ride-schedule">${icon('calendar')}${schedule(trip)}</p><p class="ride-author">Partagé par ${esc(trip.authorName || 'Un habitant')}</p></div><button class="btn secondary" data-action="detail" data-id="${trip.id}">${trip.canManage ? 'Voir et gérer' : 'Voir le trajet'}</button></article>`,
    )
    .join('');
  return `<section class="rides-page"><div class="page-heading"><div><p class="eyebrow">FAIRE UN BOUT DE CHEMIN</p><h1>Les trajets entre voisins</h1><p>Une place à proposer ou un trajet à trouver ? Partagez votre destination.</p></div><button class="btn primary" data-action="compose" data-kind="trips">${icon('plus')}Publier un trajet</button></div><p class="notice soft">${icon('chat')}Écrivez à l’auteur pour convenir du lieu de départ et des détails du trajet.</p><label class="search-box">${icon('search')}<span class="sr-only">Rechercher une destination ou un habitant</span><input id="search" type="search" placeholder="Rechercher une destination…" value="${esc(query)}"></label><div class="filters" aria-label="Filtrer les trajets">${['Tout', 'Propositions', 'Recherches'].map((value) => `<button class="chip ${filter === value ? 'selected' : ''}" data-action="filter" data-value="${value}" aria-pressed="${filter === value}">${value === 'Tout' ? 'Tous les trajets à venir' : value}</button>`).join('')}</div><p class="results-count" role="status">${loading ? 'Chargement des trajets…' : `${selected.length} trajet${selected.length > 1 ? 's' : ''} à venir`}</p><p class="ride-timezone">Dates et heures locales de Prémeyzel.</p>${loading ? '' : selected.length ? `<div class="ride-list">${cards}</div>` : `<div class="empty">${icon('car')}<h3>${query || filter !== 'Tout' ? 'Aucun trajet ne correspond' : 'On partage le prochain trajet ?'}</h3><p>${query || filter !== 'Tout' ? 'Essayez une autre destination ou retirez les filtres.' : 'Proposez votre trajet ou indiquez celui que vous cherchez.'}</p>${query || filter !== 'Tout' ? '<button class="btn secondary" data-action="reset-search">Effacer la recherche et les filtres</button>' : ''}</div>`}</section>`;
}

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export function recurrenceText(trip) {
  return (
    trip.recurrence?.days
      .map(({ day, every }) =>
        every === 2
          ? `Un ${WEEKDAYS[day - 1].toLowerCase()} sur deux`
          : `Chaque ${WEEKDAYS[day - 1].toLowerCase()}`,
      )
      .join(' · ') || ''
  );
}
export function tripFields(trip = {}) {
  const regular = !!trip.recurrence;
  return `<fieldset class="ride-type"><legend>Votre trajet</legend><label><input type="radio" name="rideType" value="offer" ${trip.rideType !== 'request' ? 'checked' : ''} required>Je propose un trajet</label><label><input type="radio" name="rideType" value="request" ${trip.rideType === 'request' ? 'checked' : ''} required>Je cherche un trajet</label></fieldset><label>Destination<input name="destination" value="${esc(trip.destination || '')}" placeholder="Belley, gare de Culoz…" maxlength="120" required></label><fieldset class="ride-type ride-schedule-choice"><legend>Fréquence</legend><label><input type="radio" name="schedule" value="once" ${regular ? '' : 'checked'}>Une seule fois</label><label><input type="radio" name="schedule" value="regular" ${regular ? 'checked' : ''}>Trajet régulier</label></fieldset><div class="form-grid"><label><span id="ride-date-label">${regular ? 'À partir du' : 'Date'}</span><input type="date" name="date" ${regular ? '' : `min="${parisDateTime().slice(0, 10)}"`} value="${esc(trip.startsOn || trip.date?.slice(0, 10) || '')}" required></label><label>Heure<input type="time" name="tripTime" value="${esc(trip.date?.slice(11) || '')}" required></label></div><fieldset id="ride-repeat" class="ride-repeat" ${regular ? '' : 'hidden disabled'}><legend>Quels jours ?</legend><p class="fine">Choisissez les jours et la fréquence de chacun. Une semaine sur deux commence au premier jour choisi à partir de la date de début.</p>${WEEKDAYS.map(
    (name, i) => {
      const day = i + 1,
        rule = trip.recurrence?.days.find((r) => r.day === day);
      return `<div class="ride-day"><label class="ride-day-choice"><input type="checkbox" name="rideDays" value="${day}" ${rule ? 'checked' : ''}>${name}</label><label class="ride-day-frequency"><span class="sr-only">Fréquence du ${name.toLowerCase()}</span><span class="select-control"><select name="repeat-${day}" ${rule ? '' : 'disabled'}><option value="1" ${rule?.every !== 2 ? 'selected' : ''}>Chaque semaine</option><option value="2" ${rule?.every === 2 ? 'selected' : ''}>Une semaine sur deux</option></select><span class="select-value" aria-hidden="true">${rule?.every === 2 ? 'Une semaine sur deux' : 'Chaque semaine'}</span></span></label></div>`;
    },
  ).join(
    '',
  )}<label>Jusqu’au (facultatif)<input type="date" name="until" value="${esc(trip.recurrence?.until || '')}"></label><p class="fine">Sans date de fin, le trajet se répète jusqu’à ce que vous le supprimiez. L’heure est la même pour tous les jours choisis.</p></fieldset><p class="fine">À l’heure de Prémeyzel. Les habitants pourront vous écrire dans l’application pour organiser le trajet.</p>`;
}
export function updateTripForm(form) {
  const regular = form.elements.schedule.value === 'regular';
  const repeat = form.querySelector('#ride-repeat');
  repeat.hidden = !regular;
  repeat.disabled = !regular;
  form.querySelector('#ride-date-label').textContent = regular ? 'À partir du' : 'Date';
  form.elements.date.min = regular ? '' : parisDateTime().slice(0, 10);
  for (const checkbox of form.querySelectorAll('[name="rideDays"]')) {
    form.elements['repeat-' + checkbox.value].disabled = !regular || !checkbox.checked;
  }
}
export function tripInput(data) {
  const days = data
    .getAll('rideDays')
    .map((day) => ({ day: Number(day), every: Number(data.get('repeat-' + day)) }));
  const regular = data.get('schedule') === 'regular';
  if (regular && !days.length)
    throw new Error('Choisissez au moins un jour pour le trajet régulier.');
  return {
    destination: data.get('destination'),
    rideType: data.get('rideType'),
    date: data.get('date') + 'T' + data.get('tripTime'),
    recurrence: regular ? { days, until: data.get('until') || null } : null,
  };
}

export function tripDetail(trip) {
  return `<div class="ride-detail"><div class="detail-top">${tripBadge(trip)}<span class="author">Partagé par ${esc(trip.authorName || 'Un habitant')}</span></div><p class="ride-destination">${icon('pin')}Destination : <strong>${esc(trip.destination)}</strong></p>${trip.recurrence ? `<p class="ride-recurring">${icon('repeat')}${esc(recurrenceText(trip))}</p><p class="ride-timezone">Prochain départ</p>` : ''}<p class="ride-schedule">${icon('calendar')}${schedule(trip)}</p><p class="ride-timezone">Heure locale de Prémeyzel.</p>${trip.recurrence?.until ? `<p class="ride-timezone">Jusqu’au ${esc(new Date(trip.recurrence.until + 'T12:00Z').toLocaleDateString('fr-FR', { timeZone: 'UTC' }))}.</p>` : ''}<p>Le lieu de départ et les autres détails se conviennent directement par message.</p></div>`;
}
