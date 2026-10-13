export const CONFIG = { village: 'Prémeyzel', tagline: 'La vie est plus belle entre voisins.', storageKey: 'premeyzel-pilot-v1', version: 1 };
export const PEOPLE = [
  { id: 'alice', name: 'Alice Martin', short: 'Alice', initials: 'AM', color: '#dce8d3' },
  { id: 'lucas', name: 'Lucas Perrin', short: 'Lucas', initials: 'LP', color: '#f3ddc5' },
  { id: 'admin', name: 'Camille · admin', short: 'Camille', initials: 'CD', color: '#dce6ee', admin: true },
  { id: 'jp', name: 'JP', short: 'JP', initials: 'JP', color: '#eddbc0' },
  { id: 'marie-laure', name: 'Marie Laure', short: 'Marie Laure', initials: 'ML', color: '#e8d9ca' },
  { id: 'emilie', name: 'Émilie', short: 'Émilie', initials: 'É', color: '#f0e6c5' },
  { id: 'mathias', name: 'Mathias', short: 'Mathias', initials: 'M', color: '#dce6ee' },
  { id: 'lou', name: 'Lou', short: 'Lou', initials: 'L', color: '#f0dbd5' },
  { id: 'sebastien', name: 'Sébastien', short: 'Sébastien', initials: 'S', color: '#dce8d3' },
];
export const AD_CATEGORIES = ['Tout', 'À louer', 'À prêter', 'À donner', 'À échanger', 'Services', 'À vendre', 'Perdu / trouvé'];
export const uid = () => globalThis.crypto.randomUUID();
export const person = id => PEOPLE.find(p => p.id === id);
export const signedIn = id => !!person(id);
export const canEdit = (id, post) => signedIn(id) && (id === post.owner || !!person(id).admin);
export function dateAfter(days, hour = '10:00') {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${hour}`;
}
export function seed() {
  return applyContentUpdates({
    version: CONFIG.version, profile: 'alice', created: new Date().toISOString(),
    events: [
      { id: 'e1', owner: 'lucas', title: 'Un dimanche au verger', category: 'Rencontre', date: dateAfter(5, '10:30'), location: 'Le verger partagé · lieu fictif', description: 'On cueille, on partage, on prend le temps. Apportez un panier et quelque chose à grignoter pour un déjeuner entre voisins. Petits et grands sont les bienvenus !', capacity: 18, art: 'orchard' },
      { id: 'e2', owner: 'alice', title: 'La grande tablée des voisins', category: 'Convivialité', date: dateAfter(9,'12:00'), location: 'Place du village · exemple', description: 'Une longue table, les spécialités de chacun et le plaisir de se retrouver. Apportez un plat à partager et vos couverts.', capacity: 24, art: 'table' },
      { id: 'e3', owner: 'lucas', title: 'Atelier boutures & petites pousses', category: 'Atelier', date: dateAfter(12,'14:30'), location: 'Le jardin d’Alice · lieu fictif', description: 'Des pots, un peu de terre et des conseils à échanger. Repartez avec de nouvelles plantes et laissez vos surplus à vos voisins.', capacity: 6, art: 'garden' },
    ],
    trips: [
      ...[1,8,15,22].map((day,i) => ({ id: `t${i+1}`, series: 's1', owner: 'lucas', title: 'Prémeyzel → Belley', from: 'Prémeyzel', to: 'Belley', date: dateAfter(day,'08:15'), capacity: 3, kind: 'offer', location: 'Place du village · exemple', description: 'Je vais à Belley chaque semaine. Départ depuis la place ; retour à organiser ensemble par message.', recurring: true })),
      { id: 't5', owner:'alice', title: 'Un passage au marché ?', from:'Prémeyzel', to:'Peyrieu', date:dateAfter(3,'09:00'), capacity:2, kind:'errand', location:'Place du village · exemple', description:'Je passe au marché. Vous pouvez venir avec moi ou me demander de rapporter quelques courses.' },
      { id: 't6', owner:'lucas', title:'Un trajet vers la gare', from:'Prémeyzel', to:'Gare de Culoz', date:dateAfter(4,'16:00'), capacity:1, kind:'request', location:'Prémeyzel · exemple', description:'Je cherche une place pour rejoindre la gare. L’horaire peut être légèrement adapté.' },
    ],
    ads: [
      { id:'a1', owner:'lucas', title:'Une remorque pour vos projets', category:'À louer', price:'15 € / jour', location:'Prémeyzel', description:'Petite remorque disponible le week-end. On convient ensemble des dates, du retrait et des conditions de location.', art:'trailer' },
      { id:'a2', owner:'alice', title:'Des œufs contre vos surplus', category:'À échanger', price:'Troc', location:'Prémeyzel', description:'Nos poules sont généreuses ! Quelques œufs à échanger contre des fruits, des légumes ou un petit coup de main.', art:'eggs' },
      { id:'a3', owner:'lucas', title:'Un coup de main au jardin', category:'Services', price:'À convenir', location:'Prémeyzel', description:'Tonte, petites plantations et entretien : discutons de ce dont vous avez besoin. Tarif et disponibilité à convenir ensemble.', art:'garden' },
      { id:'a4', owner:'alice', title:'Une perceuse, juste le temps d’un projet', category:'À prêter', price:'Prêt gratuit', location:'Prémeyzel', description:'Inutile d’en acheter une pour deux trous ! Perceuse avec quelques forets, à emprunter pour un petit projet.', art:'tools' },
      { id:'a5', owner:'lucas', title:'Je garde votre compagnon', category:'Services', price:'À convenir', location:'Prémeyzel', description:'Promenade ou visite à votre chien pendant une absence. Rencontrons-nous pour en parler.', art:'dog' },
      { id:'a6', owner:'alice', title:'Des plants de menthe à adopter', category:'À donner', price:'Gratuit', location:'Prémeyzel', description:'Des petits plants prêts à rejoindre votre jardin. Apportez un pot !', art:'plant' },
    ],
    trails: [
      { id:'r1', owner:'admin', title:'La boucle des vergers', activity:'Marche', distance:4.2, duration:75, elevation:90, difficulty:'Facile', description:'Une boucle illustrative entre vergers et lisières. Ce parcours fictif sert uniquement à tester l’interface.', location:'Autour du village · illustration', art:'orchard', route:0 },
      { id:'r2', owner:'lucas', title:'Le chemin des sous-bois', activity:'Marche', distance:7.5, duration:135, elevation:240, difficulty:'Modéré', description:'Un exemple de balade plus longue, à l’ombre des arbres. Tracé fictif, non vérifié sur le terrain.', location:'Autour du village · illustration', art:'forest', route:1 },
      { id:'r3', owner:'admin', title:'Les crêtes à VTT', activity:'VTT', distance:16, duration:120, elevation:480, difficulty:'Sportif', description:'Un exemple de fiche VTT avec dénivelé et difficulté. Ce tracé ne constitue pas un itinéraire praticable.', location:'Autour du village · illustration', art:'mountain', route:2 },
    ],
    registrations: [{id:'reg1', eventId:'e1', userId:'admin', count:2, status:'confirmed', time:1}],
    bookings: [{id:'b1', tripId:'t1', userId:'alice', seats:1, status:'pending', time:1}],
    conversations: [{id:'c1', participants:['alice','lucas'], subject:'Une remorque pour vos projets', postId:'a1', messages:[{id:'m1', sender:'alice', text:'Bonjour Lucas, la remorque serait-elle disponible samedi ?', date:new Date().toISOString()},{id:'m2', sender:'lucas', text:'Bonjour Alice ! Oui, on peut convenir d’un horaire ici.', date:new Date().toISOString()}]}],
    notifications: [{id:'n1',userId:'lucas',text:'Alice demande 1 place pour votre trajet vers Belley.',read:false,date:new Date().toISOString()}],
    reports: [], favorites: [],
  });
}
// Add each published content batch once without replacing local edits or deletions.
export function applyContentUpdates(state) {
  if ((state.contentVersion || 0) >= 1) return state;
  const additions = {
    events: [{ id:'e-fete-du-four-2026', owner:'jp', title:'La fête du four', category:'Convivialité', date:'2026-10-31', location:'Ancien four à bois du village · Prémeyzel', description:'Le 31 octobre, le vieux four à bois du village reprend du service ! Les habitants peuvent commander leur pain, qui sera cuit dans le four. Un coup de main pour préparer le four et les pains est aussi très apprécié. Pour commander, proposer votre aide ou en savoir plus, contactez JP ou Marie. Horaire et modalités de commande à préciser avec eux.', capacity:0, art:'oven', registrationNote:'L’inscription ci-dessous indique seulement votre présence dans la démo. Pour commander du pain ou aider à la préparation, contactez directement JP ou Marie. Aucune commande ni demande d’aide n’est transmise par l’application.' }],
    ads: [
      { id:'a-marie-laure-dogsitting', owner:'marie-laure', title:'Garde de chiens avec Marie Laure', category:'Services', price:'Tarif à convenir', location:'Prémeyzel', description:'Marie Laure propose ses services de garde de chiens. Contactez-la pour discuter de vos besoins, des disponibilités et des modalités de garde.', art:'dog' },
      { id:'a-emilie-eggs', owner:'emilie', title:'Émilie donne des œufs', category:'À donner', price:'Gratuit', location:'Prémeyzel', description:'Émilie a des œufs à donner aux voisins. Contactez-la pour connaître les quantités disponibles et convenir d’un moment pour les récupérer.', art:'eggs' },
      { id:'a-mathias-web', owner:'mathias', title:'Une application web avec Mathias', category:'Services', price:'Sur devis', location:'Prémeyzel', description:'Vous avez une idée d’application web ? Mathias propose ses services en freelance pour vous aider à la construire. Contactez-le pour discuter de votre projet, de vos besoins et d’un devis.', art:'webapp' },
      { id:'a-lou-icecream', owner:'lou', title:'Les glaces de Lou', category:'À vendre', price:'Prix à préciser', location:'Prémeyzel', description:'Lou vend des glaces. Contactez Lou pour découvrir les parfums, les prix et les disponibilités, et organiser votre achat.', art:'icecream' },
      { id:'a-sebastien-campervan', owner:'sebastien', title:'Le camping-car de Sébastien à louer', category:'À louer', price:'Tarif à convenir', location:'Prémeyzel', description:'Sébastien propose son camping-car à la location. Contactez-le pour connaître les disponibilités, le tarif et les conditions de location.', art:'campervan' },
    ],
  };
  for (const [collection, posts] of Object.entries(additions)) {
    state[collection].unshift(...posts.filter(post => !state[collection].some(existing => existing.id === post.id)));
  }
  state.contentVersion = 1;
  return state;
}
function requireMember(actor) { if (!signedIn(actor)) throw new Error('Choisissez un profil habitant pour continuer.'); }
function requirePost(state, collection, id) { const p=state[collection].find(p=>p.id===id&&!p.deleted); if(!p)throw new Error('Cette publication n’est plus disponible.'); return p; }
function countValid(value, max=50) { const n=Number(value); if(!Number.isInteger(n)||n<1||n>max)throw new Error(`Choisissez un nombre entier entre 1 et ${max}.`); return n; }
function notify(state,userId,text) { state.notifications.unshift({id:uid(),userId,text,read:false,date:new Date().toISOString()}); }
export const eventUsed = (s,id) => s.registrations.filter(r=>r.eventId===id&&r.status==='confirmed').reduce((n,r)=>n+r.count,0);
export const tripUsed = (s,id) => s.bookings.filter(b=>b.tripId===id&&b.status==='confirmed').reduce((n,b)=>n+b.seats,0);
function promote(state,event) {
  const queue=state.registrations.filter(r=>r.eventId===event.id&&r.status==='waiting').sort((a,b)=>a.time-b.time);
  for(const r of queue) {
    if(event.capacity && eventUsed(state,event.id)+r.count>event.capacity) break;
    r.status='confirmed'; notify(state,r.userId,`Bonne nouvelle : vos ${r.count} place(s) pour « ${event.title} » sont confirmées.`);
  }
}
export function registerEvent(state,actor,eventId,count) {
  requireMember(actor); const e=requirePost(state,'events',eventId); const n=countValid(count);
  if(e.owner===actor)throw new Error('Vous organisez cet événement.');
  if(state.registrations.some(r=>r.eventId===eventId&&r.userId===actor&&['confirmed','waiting'].includes(r.status)))throw new Error('Vous avez déjà une inscription. Annulez-la pour la modifier.');
  if(e.capacity && n>e.capacity)throw new Error('Votre groupe dépasse la capacité totale de l’événement.');
  const waiting=state.registrations.some(r=>r.eventId===eventId&&r.status==='waiting');
  const status=waiting||(e.capacity&&eventUsed(state,eventId)+n>e.capacity)?'waiting':'confirmed';
  state.registrations.push({id:uid(),eventId,userId:actor,count:n,status,time:Date.now()});
  notify(state,e.owner,`${person(actor).short} : ${n} place(s) ${status==='waiting'?'en liste d’attente':'réservée(s)'} pour « ${e.title} ».`);
  notify(state,actor,`« ${e.title} » : ${n} place(s) ${status==='waiting'?'en liste d’attente':'confirmée(s)'}.`);
  return status;
}
export function cancelRegistration(state,actor,id) {
  const r=state.registrations.find(r=>r.id===id); if(!r||r.userId!==actor)throw new Error('Vous pouvez annuler uniquement votre inscription.');
  if(!['confirmed','waiting'].includes(r.status))throw new Error('Cette inscription est déjà annulée.');
  r.status='cancelled'; const e=state.events.find(e=>e.id===r.eventId);
  if(e&&!e.deleted){notify(state,e.owner,`${person(actor).short} a annulé son inscription à « ${e.title} ».`);promote(state,e);}
}
export function bookTrip(state,actor,tripId,seats) {
  requireMember(actor); const t=requirePost(state,'trips',tripId); const n=countValid(seats,8);
  if(t.kind==='request')throw new Error('Répondez à cette recherche par message.');
  if(actor===t.owner)throw new Error('Vous proposez ce trajet.');
  if(n>t.capacity-tripUsed(state,tripId))throw new Error('Il ne reste pas assez de places.');
  if(state.bookings.some(b=>b.tripId===tripId&&b.userId===actor&&['pending','confirmed'].includes(b.status)))throw new Error('Vous avez déjà une demande pour ce départ.');
  state.bookings.push({id:uid(),tripId,userId:actor,seats:n,status:'pending',time:Date.now()});
  notify(state,t.owner,`${person(actor).short} demande ${n} place(s) pour votre trajet vers ${t.to}.`);
}
export function decideBooking(state,actor,id,accept) {
  const b=state.bookings.find(b=>b.id===id); if(!b)throw new Error('Demande introuvable.'); const t=requirePost(state,'trips',b.tripId);
  if(actor!==t.owner)throw new Error('Seul le conducteur peut répondre à cette demande.');
  if(b.status!=='pending')throw new Error('Cette demande a déjà reçu une réponse.');
  if(accept&&tripUsed(state,t.id)+b.seats>t.capacity)throw new Error('Il ne reste pas assez de places pour ce groupe.');
  b.status=accept?'confirmed':'declined'; notify(state,b.userId,`Votre demande vers ${t.to} a été ${accept?'acceptée':'refusée'}.`);
}
export function cancelBooking(state,actor,id) {
  const b=state.bookings.find(b=>b.id===id); if(!b||b.userId!==actor)throw new Error('Vous pouvez annuler uniquement votre demande.');
  if(!['pending','confirmed'].includes(b.status))throw new Error('Cette demande est déjà terminée.');
  b.status='cancelled'; const t=state.trips.find(t=>t.id===b.tripId); if(t)notify(state,t.owner,`${person(actor).short} a annulé sa demande vers ${t.to}.`);
}
export function removePost(state,actor,collection,id,series=false) {
  const p=requirePost(state,collection,id); if(!canEdit(actor,p))throw new Error('Seul l’auteur ou un admin peut supprimer cette publication.');
  const posts=series&&collection==='trips'&&p.series?state.trips.filter(t=>!t.deleted&&t.series===p.series&&new Date(t.date)>=new Date()):[p];
  for(const post of posts) {
    post.deleted=true;
    if(collection==='events') for(const r of state.registrations.filter(r=>r.eventId===post.id&&['confirmed','waiting'].includes(r.status))){r.status='cancelled-event';notify(state,r.userId,`« ${post.title} » a été annulé. Votre inscription est annulée.`);}
    if(collection==='trips') for(const b of state.bookings.filter(b=>b.tripId===post.id&&['pending','confirmed'].includes(b.status))){b.status='cancelled-trip';notify(state,b.userId,`Le trajet vers ${post.to} a été annulé. Votre réservation est annulée.`);}
  }
  return posts.length;
}
export function savePost(state,actor,collection,input,id) {
  requireMember(actor); if(!['events','trips','ads','trails'].includes(collection))throw new Error('Type inconnu.');
  const existing=id?requirePost(state,collection,id):null; if(existing&&!canEdit(actor,existing))throw new Error('Vous ne pouvez pas modifier cette publication.');
  const p={...input}; p.title=String(p.title||'').trim(); p.description=String(p.description||'').trim(); p.location=String(p.location||'').trim();
  if(p.title.length<4||p.title.length>100)throw new Error('Le titre doit contenir entre 4 et 100 caractères.');
  if(p.description.length<10||p.description.length>2000)throw new Error('La description doit contenir entre 10 et 2 000 caractères.');
  if(!p.location||p.location.length>120)throw new Error('Indiquez un lieu de 120 caractères maximum.');
  if(['events','trips'].includes(collection)) {
    if(collection==='events'&&Object.hasOwn(p,'eventTime')){p.date=p.eventTime?`${p.date}T${p.eventTime}`:p.date;delete p.eventTime;}
    const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(p.date);
    const deadline=new Date(dateOnly?`${p.date}T23:59:59`:p.date);
    if(!p.date||!Number.isFinite(deadline.getTime())||deadline<new Date()||(collection==='trips'&&dateOnly))throw new Error(collection==='events'?'Choisissez une date future.':'Choisissez une date et une heure futures.');
    const n=Number(p.capacity); if(!Number.isInteger(n)||n<0||n>500||(collection==='trips'&&(n<1||n>8)))throw new Error('Capacité invalide.'); p.capacity=n;
    if(existing&&((collection==='events'&&n&&eventUsed(state,id)>n)||(collection==='trips'&&tripUsed(state,id)>n)))throw new Error('La capacité ne peut pas être inférieure aux places déjà confirmées.');
  }
  if(collection==='trips') {
    if(!['offer','request','errand'].includes(p.kind)||!String(p.from||'').trim()||!String(p.to||'').trim())throw new Error('Précisez le type de trajet, le départ et la destination.');
    if(existing&&p.kind!==existing.kind&&state.bookings.some(b=>b.tripId===id&&['pending','confirmed'].includes(b.status)))throw new Error('Annulez ce départ avant de changer son type : des demandes sont en cours.');
  }
  if(collection==='ads'&&!AD_CATEGORIES.slice(1).includes(p.category))throw new Error('Choisissez une catégorie d’annonce.');
  if(collection==='trails') {
    if(!['Marche','VTT'].includes(p.activity)||!['Facile','Modéré','Sportif'].includes(p.difficulty))throw new Error('Activité ou difficulté invalide.');
    for(const key of ['distance','duration','elevation']){p[key]=Number(p[key]);if(!Number.isFinite(p[key])||p[key]<(key==='elevation'?0:0.1)||p[key]>10000)throw new Error('Vérifiez les caractéristiques du parcours.');}
  }
  if(existing) {
    Object.assign(existing,p); if(collection==='events')promote(state,existing);
    const recipients=new Set(collection==='events'?state.registrations.filter(r=>r.eventId===id&&['confirmed','waiting'].includes(r.status)).map(r=>r.userId):collection==='trips'?state.bookings.filter(b=>b.tripId===id&&['pending','confirmed'].includes(b.status)).map(b=>b.userId):[]);
    for(const userId of recipients)notify(state,userId,`« ${existing.title} » a été modifié. Consultez les informations à jour.`);
    return existing;
  }
  const post={...p,id:uid(),owner:actor}; state[collection].unshift(post);
  if(collection==='trips'&&p.recurring) {
    post.series=uid(); for(let i=1;i<4;i++){const d=new Date(p.date);d.setDate(d.getDate()+i*7);const local=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;state.trips.push({...post,id:uid(),date:local});}
  }
  return post;
}
export function startConversation(state,actor,owner,postId,subject,text) {
  requireMember(actor); if(!person(owner)||owner===actor)throw new Error('Choisissez un autre habitant.');
  let c=state.conversations.find(c=>c.postId===postId&&c.participants.includes(actor)&&c.participants.includes(owner));
  if(!c){c={id:uid(),participants:[actor,owner],subject,postId,messages:[]};state.conversations.unshift(c);}
  if(text)sendMessage(state,actor,c.id,text); return c;
}
export function sendMessage(state,actor,id,text) {
  requireMember(actor);const c=state.conversations.find(c=>c.id===id);if(!c||!c.participants.includes(actor))throw new Error('Cette conversation est privée.');
  text=String(text).trim();if(!text||text.length>2000)throw new Error('Écrivez un message de 1 à 2 000 caractères.');
  c.messages.push({id:uid(),sender:actor,text,date:new Date().toISOString()});
  notify(state,c.participants.find(p=>p!==actor),`${person(actor).short} vous a envoyé un message au sujet de « ${c.subject} ».`);
}
export function reportPost(state,actor,collection,id,reason) {
  requireMember(actor); const p=requirePost(state,collection,id);
  if(actor===p.owner)throw new Error('Vous pouvez modifier votre propre publication.');
  if(!String(reason).trim())throw new Error('Précisez le motif du signalement.');
  if(state.reports.some(r=>r.postId===id&&r.userId===actor&&!r.resolved))throw new Error('Vous avez déjà signalé cette publication.');
  state.reports.unshift({id:uid(),postId:id,collection,userId:actor,reason:String(reason).slice(0,1000),resolved:false});notify(state,'admin',`Une publication a été signalée : « ${p.title} ».`);
}
export function resolveReport(state,actor,id) {if(!person(actor)?.admin)throw new Error('Accès réservé à l’admin.');const r=state.reports.find(r=>r.id===id);if(r)r.resolved=true;}
