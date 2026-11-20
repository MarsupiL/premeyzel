import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parisDateTime,
  selectTrips,
  tripFields,
  tripDetail,
  tripsPage,
  recurrenceText,
  tripInput,
} from '../trips.js';

test('rides use Paris time and sort/filter departures without changing the source', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  assert.equal(parisDateTime(now), '2026-11-20T11:00');
  assert.equal(parisDateTime(new Date('2027-06-01T22:30:00Z')), '2027-06-02T00:30');
  const rides = [
    {
      id: 'a',
      destination: 'Chambéry',
      authorName: 'Alice',
      date: '2026-11-21T12:00',
      departureAt: Date.parse('2026-11-21T11:00Z'),
      rideType: 'offer',
    },
    {
      id: 'b',
      destination: 'Belley',
      authorName: 'Bob',
      date: '2026-11-20T12:00',
      departureAt: Date.parse('2026-11-20T11:00Z'),
      rideType: 'request',
    },
    {
      id: 'c',
      destination: 'Culoz',
      authorName: 'Chloé',
      date: '2026-11-20T10:59',
      departureAt: Date.parse('2026-11-20T09:59Z'),
      rideType: 'offer',
    },
  ];
  const ids = (filter, query = '') => selectTrips(rides, filter, query, now).map((r) => r.id);
  assert.deepEqual(ids('Tout'), ['b', 'a']);
  assert.deepEqual(ids('Propositions'), ['a']);
  assert.deepEqual(ids('Recherches'), ['b']);
  assert.deepEqual(selectTrips(rides, 'Tout', '', new Date('2026-11-21T11:00Z')), []);
  assert.deepEqual(ids('Tout', 'chambery'), ['a']);
  assert.deepEqual(ids('Tout', 'BOB'), ['b']);
  assert.deepEqual(
    rides.map((r) => r.id),
    ['a', 'b', 'c'],
  );
});

test('ride cards, details and form escape user text and keep publishing to the requested fields', () => {
  const ride = {
    id: 'a',
    destination: '<img src=x onerror=alert(1)>',
    authorName: '<script>bad()</script>',
    date: '2099-06-01T08:30',
    departureAt: Date.parse('2099-06-01T06:30Z'),
    rideType: 'request',
  };
  for (const html of [
    tripFields(ride),
    tripDetail(ride),
    tripsPage([ride], { filter: 'Tout', query: '"><script>bad()</script>', loading: false }),
    tripsPage([ride], { filter: 'Tout', query: '', loading: false }),
  ]) {
    assert.doesNotMatch(html, /<script>|<img src=x/);
  }
  const fields = tripFields(ride);
  assert.match(fields, /value="request" checked/);
  assert.match(fields, /name="destination"/);
  assert.match(fields, /name="date"/);
  assert.match(fields, /name="tripTime"/);
  assert.doesNotMatch(fields, /name="(title|location|contact|photo|capacity)"/);
});

test('regular rides preserve their original start date and independent day frequencies', () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    destination: 'Belley',
    rideType: 'request',
    schedule: 'regular',
    date: '2026-11-23',
    tripTime: '08:30',
    'repeat-1': '1',
    'repeat-5': '2',
    until: '2026-12-31',
  }))
    data.set(key, value);
  assert.throws(() => tripInput(data), /au moins un jour/);
  data.append('rideDays', '1');
  data.append('rideDays', '5');
  const input = tripInput(data);
  assert.deepEqual(input.recurrence, {
    days: [
      { day: 1, every: 1 },
      { day: 5, every: 2 },
    ],
    until: '2026-12-31',
  });
  assert.equal(recurrenceText(input), 'Chaque lundi · Un vendredi sur deux');
  const fields = tripFields({ ...input, startsOn: '2026-11-23', date: '2026-12-07T08:30' });
  assert.match(fields, /value="2026-11-23"/);
  assert.match(fields, /name="schedule" value="regular" checked/);
  data.set('schedule', 'once');
  assert.equal(tripInput(data).recurrence, null);
});

test('available seat counts appear in cards and details with full and unknown states', () => {
  const base = {
    id: 'ride',
    destination: 'Belley',
    rideType: 'offer',
    date: '2099-06-12T08:30',
    departureAt: Date.parse('2099-06-12T06:30Z'),
  };
  for (const [seats, label] of [
    [3, '3 places disponibles'],
    [1, '1 place disponible'],
    [0, 'Complet · 0 place disponible'],
    [undefined, 'Places à préciser'],
  ]) {
    const ride = { ...base, seats };
    for (const html of [
      tripDetail(ride),
      tripsPage([ride], { filter: 'Tout', query: '', loading: false }),
    ])
      assert.ok(html.includes(label));
  }
  assert.doesNotMatch(tripDetail({ ...base, rideType: 'request', seats: 3 }), /places disponibles/);
  const fields = tripFields({ ...base, seats: 0 });
  assert.match(fields, /name="seats"[^>]*value="0"[^>]*required/);
  assert.match(tripFields({ ...base, rideType: 'request' }), /name="seats"[^>]*disabled/);
  assert.match(tripFields(base), /name="seats"[^>]*value=""/);
});

test('offer forms submit seats, including zero, while switching to a request clears them', () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    destination: 'Belley',
    rideType: 'offer',
    schedule: 'once',
    date: '2099-06-12',
    tripTime: '08:30',
    seats: '3',
  }))
    data.set(key, value);
  assert.equal(tripInput(data).seats, 3);
  data.set('seats', '0');
  assert.equal(tripInput(data).seats, 0);
  for (const value of ['', ' ', '-1', '9', '1.5']) {
    data.set('seats', value);
    assert.throws(() => tripInput(data), /places disponibles/);
  }
  data.set('rideType', 'request');
  assert.equal(tripInput(data).seats, null);
});

test('date-filtered rides keep destination/type filters and show the selected occurrence', () => {
  const ride = {
    id: 'ride',
    destination: 'Belley',
    authorName: 'Alice',
    rideType: 'offer',
    seats: 3,
    date: '2099-12-11T08:30',
    departureAt: Date.parse('2099-12-11T07:30Z'),
    recurrence: { days: [{ day: 5, every: 2 }], until: null },
  };
  const html = tripsPage([ride], {
    filter: 'Propositions',
    query: 'belley',
    date: '2099-12-11',
    loading: false,
  });
  assert.match(html, /id="trip-date-filter"[^>]*value="2099-12-11"/);
  assert.match(html, /Toutes les dates/);
  assert.match(html, /Départ sélectionné/);
  assert.match(html, /11 décembre 2099/);
  assert.match(html, /3 places disponibles/);
  assert.doesNotMatch(html, /Prochain départ/);
  assert.match(tripDetail(ride, '2099-12-11'), /Départ sélectionné/);
  for (const options of [
    { filter: 'Recherches', query: '' },
    { filter: 'Tout', query: 'Paris' },
  ]) {
    const empty = tripsPage([ride], { ...options, date: '2099-12-11', loading: false });
    assert.match(empty, /Aucun trajet ne correspond/);
    assert.match(empty, /Effacer la recherche et les filtres/);
    assert.doesNotMatch(empty, /<article class="ride-card"/);
  }
  assert.match(
    tripsPage([], { filter: 'Tout', query: '', date: '2099-12-11', loading: true }),
    /Chargement des trajets/,
  );
});
