import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,canEdit,registerEvent,cancelRegistration,eventUsed,bookTrip,decideBooking,cancelBooking,tripUsed,removePost,savePost,dateAfter,startConversation,sendMessage,reportPost,resolveReport} from '../model.js';

test('post changes are limited to author/admin, guest cannot publish',()=>{
  const s=seed(),p=s.ads[0];assert.equal(canEdit('alice',p),false);assert.equal(canEdit('lucas',p),true);assert.equal(canEdit('admin',p),true);
  assert.throws(()=>removePost(s,'alice','ads',p.id));assert.throws(()=>savePost(s,'guest','ads',p));
  removePost(s,'admin','ads',p.id);assert.equal(p.deleted,true);
});
test('household registrations and duplicate protection',()=>{
  const s=seed();assert.equal(registerEvent(s,'alice','e1',3),'confirmed');assert.equal(eventUsed(s,'e1'),5);
  assert.throws(()=>registerEvent(s,'alice','e1',1));assert.throws(()=>registerEvent(s,'lucas','e1',1));
  assert.throws(()=>registerEvent(s,'alice','e3',1.5));assert.throws(()=>registerEvent(s,'alice','e3',0));
});
test('whole groups enter waiting list and are promoted on cancellation',()=>{
  const s=seed();s.events.find(e=>e.id==='e3').capacity=4;
  registerEvent(s,'admin','e3',3);assert.equal(registerEvent(s,'alice','e3',2),'waiting');assert.equal(eventUsed(s,'e3'),3);
  cancelRegistration(s,'admin',s.registrations.find(r=>r.eventId==='e3'&&r.userId==='admin').id);
  assert.equal(s.registrations.find(r=>r.eventId==='e3'&&r.userId==='alice').status,'confirmed');
  assert.equal(eventUsed(s,'e3'),2);assert.ok(s.notifications.some(n=>n.userId==='alice'&&n.text.includes('Bonne nouvelle')));
});
test('FIFO waiting group blocks later smaller groups until it fits',()=>{
  const s=seed(),e=s.events.find(e=>e.id==='e1');e.capacity=5;
  s.registrations=[{id:'confirmed',eventId:'e1',userId:'admin',count:3,status:'confirmed',time:0},{id:'first',eventId:'e1',userId:'alice',count:3,status:'waiting',time:1},{id:'second',eventId:'e1',userId:'admin',count:1,status:'waiting',time:2}];
  savePost(s,'lucas','events',{...e,capacity:5},e.id);
  assert.equal(s.registrations.find(r=>r.id==='first').status,'waiting');assert.equal(s.registrations.find(r=>r.id==='second').status,'waiting');
  savePost(s,'lucas','events',{...e,capacity:7},e.id);
  assert.equal(eventUsed(s,'e1'),7);
});
test('queue exists: new small registrations cannot jump it',()=>{
  const s=seed();const e=s.events.find(e=>e.id==='e3');e.capacity=5;
  s.registrations.push({id:'waiting-large',eventId:'e3',userId:'admin',count:5,status:'waiting',time:0});
  assert.equal(registerEvent(s,'alice','e3',1),'waiting');
});
test('pending ride requests do not consume seats; acceptance prevents overbooking',()=>{
  const s=seed();bookTrip(s,'admin','t1',3);assert.equal(tripUsed(s,'t1'),0);
  const admin=s.bookings.find(b=>b.tripId==='t1'&&b.userId==='admin');decideBooking(s,'lucas',admin.id,true);assert.equal(tripUsed(s,'t1'),3);
  assert.throws(()=>decideBooking(s,'lucas','b1',true),/assez de places/);assert.equal(s.bookings.find(b=>b.id==='b1').status,'pending');
  cancelBooking(s,'admin',admin.id);decideBooking(s,'lucas','b1',true);assert.equal(tripUsed(s,'t1'),1);
});
test('only driver decides bookings, including when admin edits posts',()=>{
  const s=seed();assert.throws(()=>decideBooking(s,'admin','b1',true));assert.throws(()=>decideBooking(s,'alice','b1',true));
  decideBooking(s,'lucas','b1',false);assert.equal(s.bookings[0].status,'declined');assert.throws(()=>decideBooking(s,'lucas','b1',true));
});
test('seat requests enforce capacity, integers and per-departure uniqueness',()=>{
  const s=seed();assert.throws(()=>bookTrip(s,'alice','t1',1));assert.throws(()=>bookTrip(s,'admin','t1',4));assert.throws(()=>bookTrip(s,'admin','t1',1.5));
  bookTrip(s,'alice','t2',2);assert.equal(s.bookings.filter(b=>b.userId==='alice').length,2);
  assert.throws(()=>bookTrip(s,'alice','t6',1));assert.throws(()=>bookTrip(s,'guest','t2',1));
});
test('authors/admin removal cancels commitments, preserves records, notifies affected profiles',()=>{
  const s=seed();registerEvent(s,'alice','e1',2);removePost(s,'admin','events','e1');
  assert.ok(s.registrations.filter(r=>r.eventId==='e1').every(r=>r.status==='cancelled-event'));
  assert.ok(s.notifications.some(n=>n.userId==='alice'&&n.text.includes('annulé')));
  assert.throws(()=>registerEvent(s,'alice','e1',1));removePost(s,'lucas','trips','t1');assert.equal(s.bookings[0].status,'cancelled-trip');
});
test('cancel a single departure or all future trips in the series',()=>{
  const s=seed();assert.equal(removePost(s,'lucas','trips','t2'),1);assert.equal(s.trips.find(t=>t.id==='t1').deleted,undefined);
  assert.equal(removePost(s,'admin','trips','t1',true),3);assert.equal(s.trips.filter(t=>t.series==='s1'&&!t.deleted).length,0);
  assert.equal(s.trips.find(t=>t.id==='t5').deleted,undefined);
});
test('weekly creation uses independent IDs and preserves local time across dates',()=>{
  const s=seed();const p=savePost(s,'alice','trips',{title:'Vers le marché',description:'Une proposition de trajet test.',date:dateAfter(2,'09:15'),location:'Village',from:'Prémeyzel',to:'Belley',kind:'offer',capacity:2,recurring:true});
  const trips=s.trips.filter(t=>t.series===p.series);assert.equal(trips.length,4);assert.equal(new Set(trips.map(t=>t.id)).size,4);assert.ok(trips.every(t=>t.date.endsWith('09:15')));
});
test('edit rejects capacity reduction below confirmed seats and informs participants',()=>{
  const s=seed();decideBooking(s,'lucas','b1',true);const trip=s.trips.find(t=>t.id==='t1');
  assert.throws(()=>savePost(s,'lucas','trips',{...trip,capacity:0},trip.id));
  assert.throws(()=>savePost(s,'lucas','trips',{...trip,kind:'request'},trip.id));
  const e=s.events[0];assert.throws(()=>savePost(s,'lucas','events',{...e,capacity:1},e.id));
  savePost(s,'admin','events',{...e,title:'Nouvelle rencontre'},e.id);assert.ok(s.notifications.some(n=>n.userId==='admin'&&n.text.includes('modifié')));
});
test('rental listing stores its rate and can be edited by its owner',()=>{
  const s=seed();const p=savePost(s,'alice','ads',{title:'Tondeuse à louer',description:'Une tondeuse disponible le week-end.',location:'Prémeyzel',category:'À louer',price:'10 € / jour'});
  assert.equal(p.category,'À louer');assert.equal(p.price,'10 € / jour');
  assert.throws(()=>savePost(s,'lucas','ads',{...p,price:'0'},p.id));savePost(s,'alice','ads',{...p,price:'12 € / jour'},p.id);assert.equal(p.price,'12 € / jour');
});
test('conversations are reused per post and admin is not implicitly a participant',()=>{
  const s=seed();const c=startConversation(s,'alice','lucas','a1','Remorque','Disponible demain ?');assert.equal(c.id,'c1');
  assert.throws(()=>sendMessage(s,'admin',c.id,'Message interdit'));sendMessage(s,'lucas',c.id,'Oui, à demain.');assert.equal(c.messages.at(-1).sender,'lucas');
  assert.throws(()=>sendMessage(s,'alice',c.id,'   '));removePost(s,'lucas','ads','a1');sendMessage(s,'alice',c.id,'Merci !');assert.equal(c.messages.at(-1).text,'Merci !');
});
test('reporting does not remove posts; only admin resolves a report',()=>{
  const s=seed();reportPost(s,'alice','ads','a1','À vérifier');assert.equal(s.ads[0].deleted,undefined);
  assert.throws(()=>reportPost(s,'alice','ads','a1','Doublon'));const id=s.reports[0].id;assert.throws(()=>resolveReport(s,'lucas',id));resolveReport(s,'admin',id);assert.equal(s.reports[0].resolved,true);
});
