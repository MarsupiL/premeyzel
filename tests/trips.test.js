import test from 'node:test';
import assert from 'node:assert/strict';
import { parisDateTime, selectTrips, tripFields, tripDetail, tripsPage } from '../trips.js';

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
      rideType: 'offer',
    },
    {
      id: 'b',
      destination: 'Belley',
      authorName: 'Bob',
      date: '2026-11-20T12:00',
      rideType: 'request',
    },
    {
      id: 'c',
      destination: 'Culoz',
      authorName: 'Chloé',
      date: '2026-11-20T10:59',
      rideType: 'offer',
    },
  ];
  const ids = (filter, query = '') => selectTrips(rides, filter, query, now).map((r) => r.id);
  assert.deepEqual(ids('Tout'), ['b', 'a']);
  assert.deepEqual(ids('Propositions'), ['a']);
  assert.deepEqual(ids('Recherches'), ['b']);
  assert.deepEqual(ids('Passés'), ['c']);
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
