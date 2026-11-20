import { escapeHTML as esc } from './html.js';
import { normalizeSearch } from './search.js';
import {
  tripsPage,
  tripResults,
  tripDateHelp,
  tripFields,
  tripDetail,
  updateTripForm,
  tripInput,
} from './trips.js';
import { emailForm, mountEmailForm, authFormBusy, authMode } from './auth-ui.js';
import { pushSettings, syncPushAccount, disconnectPush } from './push-ui.js';
import {
  notificationDestination,
  rememberNotificationDestination,
  takeNotificationDestination,
} from './notification-links.js';
import {
  setMessagingAccount,
  mountMessages,
  unmountMessages,
  refreshInbox,
  openContact,
} from './messages-ui.js';
import { icon } from './icons.js';
import { openFeedback, clearFeedbackDraft } from './feedback-ui.js';
import { villageArt, cardArt } from './art.js';
import { defaultArt, preparePhoto, photoSource } from './photos.js';
import { API_BASE, request, allPages, sessionGeneration, isSessionChange } from './api-client.js';
import { initializeAuth, authConfig, currentAccount, signIn, signOut } from './auth.js';
import { mountTrails, unmountTrails, requestTrailCompose } from './trails-ui.js';
import { setTrailAccount, claimLegacyTrails, hasLegacyTrails } from './trail-api.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = './resident.css';
document.head.append(stylesheet);
const $ = (s) => document.querySelector(s);

const AD_CATEGORIES = [
  'À louer',
  'À prêter',
  'À donner',
  'À échanger',
  'Services',
  'Je recherche',
  'À vendre',
  'Perdu / trouvé',
];
const EVENT_CATEGORIES = ['Rencontre', 'Convivialité', 'Atelier', 'Sport', 'Culture'];
const navs = [
  ['accueil', 'home', 'Le village'],
  ['evenements', 'calendar', 'Événements'],
  ['trajets', 'car', 'Trajets'],
  ['annonces', 'tag', 'Petites annonces'],
  ['balades', 'trail', 'Balades'],
];
let user = null,
  events = [],
  ads = [],
  trips = [],
  tripDate = '',
  filteredTripDate = '',
  filteredTrips = [],
  members = [],
  loading = true,
  loadError = '',
  authError = '',
  query = '',
  filter = 'Tout',
  draft = null,
  focusBeforeDialog = null,
  refreshing = null,
  installPrompt = null;
const imageURLs = new Map();
const imageLoads = new Map();
let profileDraft = null;
let renderedAccount = '';
let tripExpiryTimer = null;
let detailRequest = 0,
  linkedEvent = '';
function avatar(person, cls = '') {
  const photo = person?.photo,
    initial = person?.name?.trim().slice(0, 1).toUpperCase() || '?';
  const local = typeof photo === 'string' && photo.startsWith('data:image/jpeg;base64,');
  const remote = typeof photo === 'string' && photo.startsWith('/api/residents/');
  return `<span class="avatar avatar-photo ${cls}">${esc(initial)}${local ? `<img src="${esc(photo)}" alt="">` : remote ? `<img data-private-photo="${esc(API_BASE + photo)}" alt="">` : ''}</span>`;
}
const isAdmin = () => ['owner', 'admin'].includes(user?.role);
const firstName = () => user?.name.split(/\s+/)[0] || '';
const roleName = (role) =>
  ({ owner: 'Propriétaire', admin: 'Administrateur', member: 'Habitant' })[role] || 'Habitant';
const route = () => {
  const r = location.hash.replace('#/', '').split('?')[0];
  return [
    'accueil',
    'connexion',
    'compte',
    'evenements',
    'trajets',
    'annonces',
    'balades',
    'admin',
    'confidentialite',
    'messages',
  ].includes(r)
    ? r
    : 'accueil';
};
const dateText = (value) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(value.slice(0, 10) + 'T12:00:00'),
  );
const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;
const title = (kicker, heading, text, button = '') =>
  `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${heading}</h1><p>${text}</p></div>${button}</div>`;
const empty = (heading, text) =>
  `<div class="empty">${icon('leaf')}<h3>${heading}</h3><p>${text}</p></div>`;
const publish = (kind, label) =>
  `<button class="btn primary" data-action="compose" data-kind="${kind}">${icon('plus')}${label}</button>`;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 6000);
}
function clearPhotos() {
  for (const url of imageURLs.values()) URL.revokeObjectURL(url);
  imageURLs.clear();
  imageLoads.clear();
}
function visual(post, kind) {
  const photo = post.photo,
    local =
      typeof photo === 'string' &&
      (photo.startsWith('data:image/jpeg;') || photo.startsWith('sample:'))
        ? photoSource(photo)
        : null;
  return `<span class="post-visual">${cardArt(defaultArt(kind))}${local ? `<img class="post-photo" alt="" src="${esc(local)}">` : photo?.startsWith(API_BASE + '/api/posts/') ? `<img class="post-photo" alt="" data-private-photo="${esc(photo)}">` : ''}</span>`;
}
async function loadPhotos() {
  const account = user?.id;
  for (const img of document.querySelectorAll('[data-private-photo]')) {
    const url = img.dataset.privatePhoto;
    try {
      let object = imageURLs.get(url);
      if (!object) {
        if (!imageLoads.has(url)) {
          const serial = sessionGeneration();
          const loading = request(url.slice((API_BASE + '/api/').length), { blob: true })
            .then((blob) => {
              if (serial !== sessionGeneration() || account !== user?.id) return null;
              const objectURL = URL.createObjectURL(blob);
              imageURLs.set(url, objectURL);
              return objectURL;
            })
            .finally(() => {
              if (imageLoads.get(url) === loading) imageLoads.delete(url);
            });
          imageLoads.set(url, loading);
        }
        object = await imageLoads.get(url);
      }
      if (!object || account !== user?.id) return;
      if (img.isConnected) img.src = object;
    } catch {
      if (img.isConnected) img.remove();
    }
  }
}
function canManage(post) {
  return !!user && post.canManage;
}
function currentTripView() {
  return [
    tripDate ? (filteredTripDate === tripDate ? filteredTrips : []) : trips,
    {
      filter,
      query,
      date: tripDate,
      loading: loading || (!!tripDate && filteredTripDate !== tripDate),
    },
  ];
}
function updateTripResults() {
  $('#trip-date-help').textContent = tripDateHelp(tripDate);
  $('#trip-results').innerHTML = loadError
    ? `<div class="notice warning" role="alert"><span>${esc(loadError)}</span><button class="btn secondary" data-action="refresh">Réessayer</button></div>`
    : tripResults(...currentTripView());
}
function render() {
  if (authFormBusy()) return;
  const r = route();
  // Native calendars own their confirmation UI. Replacing or refocusing this
  // input during a change (or an in-flight refresh) dismisses that UI on iOS.
  if (
    r === 'trajets' &&
    user &&
    renderedAccount === user.id &&
    document.activeElement?.id === 'trip-date-filter'
  ) {
    updateTripResults();
    return;
  }
  renderedAccount = user?.id || '';
  unmountTrails();
  unmountMessages();
  setTrailAccount(user);
  setMessagingAccount(user, { avatar, loadPhotos, toast, modal, closeModal, openPost: detail });
  $('#app').innerHTML =
    `<header class="topbar"><a href="#/accueil" class="brand" aria-label="Prémeyzel, accueil"><img src="./assets/icon.svg" alt="" width="42" height="42"><span>Prémeyzel<small>ENTRE VOISINS</small></span></a><div class="header-actions">${user ? `<button class="icon-button feedback-button" data-action="feedback" aria-label="Envoyer un retour" title="Un problème ou une idée ?">${icon('flag')}</button><a class="icon-button messages-link" href="#/messages" data-message-link aria-label="Messages">${icon('chat')}<span class="unread-count" data-message-count hidden></span></a>` : ''}<button class="icon-button" data-action="install" aria-label="Installer l’application">${icon('download')}</button><a href="#/${user ? 'compte' : 'connexion'}" class="profile-button" aria-label="${user ? 'Mon compte · ' + esc(user.name) : 'Se connecter'}">${user ? avatar(user) : `<span class="avatar">${icon('user')}</span>`}<span>${user ? esc(firstName()) : 'Se connecter'}<small>${user ? roleName(user.role) : 'Rejoindre le village'}</small></span>${icon('chevron')}</a></div></header>
 <div class="layout"><aside class="sidebar"><nav aria-label="Navigation principale">${navs.map(([key, i, label]) => `<a href="#/${key}" class="nav-item ${r === key ? 'active' : ''}" ${r === key ? 'aria-current="page"' : ''}>${icon(i)}<span>${label}</span></a>`).join('')}</nav><div class="sidebar-divider"></div>${user ? `<a href="#/compte" class="nav-item ${r === 'compte' ? 'active' : ''}">${icon('user')}Mon compte</a><a href="#/messages" class="nav-item ${r === 'messages' ? 'active' : ''}" data-message-link>${icon('chat')}Messages<span class="unread-count" data-message-count hidden></span></a>` : ''}${isAdmin() ? `<a href="#/admin" class="nav-item ${r === 'admin' ? 'active' : ''}">${icon('shield')}Administration</a>` : ''}<div class="sidebar-note">${icon('leaf')}<h3>Un village.<br>Mille petits liens.</h3><p>Des rencontres, des coups de main et des chemins à partager.</p></div><a class="sidebar-footer" href="./confidentialite.html">Vos données personnelles</a><a class="sidebar-footer" href="./conditions.html">Conditions d’utilisation</a><p class="sidebar-footer">Initiative communautaire indépendante<br>Prémeyzel · Bugey Sud</p></aside>
 <main id="main" tabindex="-1">${authConfig() && !authConfig().accountsEnabled ? '<p class="notice warning" role="status">Aperçu de la prochaine version · les inscriptions ne sont pas encore ouvertes.</p>' : ''}${loadError ? `<div class="notice warning" role="alert"><span>${esc(loadError)}</span><button class="btn secondary" data-action="refresh">Réessayer</button></div>` : ''}${!navigator.onLine ? '<p class="notice">Hors connexion · la connexion et les publications nécessitent Internet.</p>' : ''}${page(r)}</main></div>
 <nav class="mobile-nav" aria-label="Navigation mobile">${navs.map(([key, i, label]) => `<a href="#/${key}" ${r === key ? 'aria-current="page"' : ''}>${icon(i)}<span>${key === 'annonces' ? 'Annonces' : key === 'accueil' ? 'Village' : label}</span></a>`).join('')}</nav>`;
  if (r === 'messages' && user) mountMessages($('#messages-app'));
  if (user && r !== 'messages') refreshInbox();
  if (r === 'balades')
    mountTrails($('#trails-app'), {
      authorName: firstName(),
      residentMode: true,
      account: user,
      onRequireAuth: () => (location.hash = '#/connexion'),
    });
  mountEmailForm(async (message) => {
    await refreshData(false);
    location.hash = takeNotificationDestination() || '#/compte';
    render();
    if (message) toast(message);
  });
  loadPhotos();
  if (user) syncPushAccount(user);
  // OAuth returns without a hash. Keep its saved destination until auth initialization
  // has consumed it; the initial signed-out shell must not erase that value.
  if (!user && !loading) rememberNotificationDestination();
  openLinkedEvent();
}
function page(r) {
  if (r === 'connexion') return loginPage();
  if (r === 'confidentialite') return privacyPage();
  if (r === 'balades')
    return '<div id="trails-app"><p class="notice">Chargement des parcours…</p></div>';
  if (['trajets', 'annonces', 'compte', 'admin', 'messages'].includes(r) && !user)
    return loginPage();
  if (r === 'trajets') return tripsPage(...currentTripView());
  if (r === 'messages') return '<div id="messages-app"></div>';
  if (r === 'compte') return accountPage();
  if (r === 'admin') return adminPage();
  if (r === 'evenements' || r === 'annonces')
    return listPage(r === 'evenements' ? 'events' : 'ads');
  return homePage();
}
function googleIcon() {
  return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.2l-3.3-2.6a6.2 6.2 0 0 1-9.2-3.3H2.9v2.7A10.2 10.2 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.3 13.9a6 6 0 0 1 0-3.8V7.4H2.9a10.1 10.1 0 0 0 0 9.2l3.4-2.7Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.2 10.2 0 0 0-9.1 5.4l3.4 2.7A6.1 6.1 0 0 1 12 6Z"/></svg>';
}
function loginPage() {
  const config = authConfig(),
    available = config?.accountsEnabled && config?.configured;
  if (user && authMode() !== 'reset') return accountPage();
  return `<section class="auth-layout"><div class="auth-story"><p class="eyebrow">PRÉMEYZEL · ENTRE VOISINS</p><h1>Le village commence<br>avec vous.</h1><p>Un compte pour partager un événement, proposer un coup de main ou faire découvrir votre chemin préféré.</p><div class="auth-art">${villageArt()}</div><div class="auth-benefits"><span>${icon('calendar')}Des occasions de se retrouver</span><span>${icon('tag')}Des choses utiles à partager</span><span>${icon('trail')}Des chemins à découvrir</span></div></div><div class="auth-panel"><span class="auth-symbol">${icon('users')}</span><h2>Bienvenue entre voisins</h2><p>Créez votre compte ou retrouvez-le en quelques instants.</p><div class="social-buttons"><button class="social-button" data-action="sign-in" data-provider="google" ${!available || !config?.providers.google ? 'disabled' : ''}>${googleIcon()}<span>Continuer avec Google</span></button></div>${!available ? '<p class="notice soft">Le service de connexion est momentanément indisponible.</p>' : ''}<p id="auth-error" class="form-error" role="alert">${esc(authError)}</p>${emailForm()}<p class="fine">Votre nom accompagne vos publications. Votre adresse e-mail n’est pas affichée aux autres habitants. <a href="./confidentialite.html">En savoir plus</a></p><a class="text-link" href="#/accueil">Continuer la visite sans compte</a><div class="auth-admin"><a href="${API_BASE}/admin" target="_blank" rel="noopener">Accès administrateur existant</a></div></div></section>`;
}
function homePage() {
  return `<section class="hero"><div class="hero-copy"><span class="hero-label">${icon('pin')}AIN · BUGEY SUD</span><h1>La vie est plus belle<br><em>entre voisins.</em></h1><p>Se retrouver, s’entraider, partager.<br>Les petites choses qui font notre village.</p>${publish('', 'Partager quelque chose')}<span class="hero-footnote">Bienvenue ${user ? esc(firstName()) : 'à Prémeyzel'} ${icon('sun')}</span></div><div class="hero-art">${villageArt()}<span class="art-caption">Notre coin de nature, notre coin de vie.</span></div></section><div class="quick-links">${[
    ['evenements', 'calendar', 'On se retrouve ?', 'Les rendez-vous du village'],
    ['trajets', 'car', 'On partage le chemin ?', 'Proposer ou chercher un trajet'],
    ['annonces', 'tag', 'Ça peut servir !', 'Donner, louer, prêter, échanger'],
    ['balades', 'trail', 'On prend l’air ?', 'À pied ou à vélo'],
  ]
    .map(
      ([href, i, t, s]) =>
        `<a href="#/${href}" class="quick-link"><span class="quick-icon ${href}">${icon(i)}</span><span><strong>${t}</strong><small>${s}</small></span>${icon('chevron')}</a>`,
    )
    .join(
      '',
    )}</div><div class="section-heading"><div><h2>Les rendez-vous du village</h2><p>Des occasions de se retrouver.</p></div><a class="text-link" href="#/evenements">Voir l’agenda</a></div>${
    loading
      ? '<p class="notice">Chargement de l’agenda…</p>'
      : events.length
        ? `<div class="event-grid">${events
            .slice(0, 3)
            .map((p) => postCard(p))
            .join('')}</div>`
        : empty('L’agenda attend vos idées', 'Proposez le prochain rendez-vous entre voisins.')
  }`;
}
function postCard(p) {
  const event = p.kind === 'events';
  return `<article class="card ${event ? 'event-card' : 'ad-card'}"><button class="card-image" data-action="detail" data-id="${p.id}" aria-label="Voir ${esc(p.title)}">${visual(p, p.kind)}<span class="image-badge">${badge(p.category)}</span></button><div class="card-body">${!event ? `<div class="price">${esc(p.price || 'À convenir')}</div>` : ''}<h3><button class="title-button" data-action="detail" data-id="${p.id}">${esc(p.title)}</button></h3>${event ? `<p class="meta">${icon('calendar')}${dateText(p.date)} · ${p.date.includes('T') ? esc(p.date.split('T')[1]) : 'Horaire à préciser'}</p>` : `<p class="ad-excerpt">${esc(p.description)}</p>`}<p class="meta">${icon('pin')}${esc(p.location)}</p><div class="card-footer"><span class="author">${esc(p.authorName || 'Un habitant')}${p.mine ? ' · Vous' : ''}</span>${event ? `<span class="availability">${p.capacity ? Math.max(0, p.capacity - p.used) + ' places libres' : 'Ouvert à tous'}</span>` : canManage(p) ? badge('Gérer', 'plain') : ''}</div></div></article>`;
}
function listPage(kind) {
  const source = kind === 'events' ? events : ads,
    posts = source.filter(
      (p) =>
        (filter === 'Tout' || p.category === filter) &&
        normalizeSearch(`${p.title} ${p.description} ${p.authorName}`).includes(
          normalizeSearch(query),
        ),
    );
  return `${kind === 'events' ? title('SE RETROUVER', 'Les rendez-vous du village', 'Un atelier, une fête, un moment à partager.', publish(kind, 'Proposer un événement')) : title('ÇA PEUT SERVIR', 'Les petites annonces', 'À donner, à louer, à prêter… et tellement à partager.', publish(kind, 'Déposer une annonce'))}<label class="search-box">${icon('search')}<span class="sr-only">Rechercher</span><input id="search" type="search" placeholder="Rechercher…" value="${esc(query)}"></label><div class="filters">${['Tout', ...(kind === 'events' ? EVENT_CATEGORIES : AD_CATEGORIES)].map((value) => `<button class="chip ${filter === value ? 'selected' : ''}" data-action="filter" data-value="${esc(value)}" aria-pressed="${filter === value}">${value}</button>`).join('')}</div><p class="results-count" role="status">${posts.length} publication${posts.length > 1 ? 's' : ''}</p>${loading ? '<p class="notice">Chargement des publications…</p>' : posts.length ? `<div class="${kind === 'events' ? 'event' : 'ad'}-grid">${posts.map(postCard).join('')}</div>` : normalizeSearch(query) || filter !== 'Tout' ? `<div class="empty">${icon('search')}<h3>Aucune publication ne correspond</h3><p>Essayez un autre mot ou retirez les filtres.</p><button class="btn secondary" data-action="reset-search">Effacer la recherche et les filtres</button></div>` : empty('À vous de commencer', 'La prochaine bonne idée peut être la vôtre.')}`;
}
function accountPage() {
  return `${title('MON COIN DU VILLAGE', 'Bonjour ' + esc(firstName()), 'Retrouvez votre compte et vos publications.')}<section class="account-card"><div><h2>${esc(user.name)}</h2>${badge(roleName(user.role))}<p>Votre compte fonctionne sur tous vos appareils après connexion.</p></div><button class="btn secondary" data-action="sign-out">${icon('logout')}Me déconnecter</button></section>${profileSection()}${pushSettings()}${hasLegacyTrails() ? '<section class="activity-section"><h2>Vos parcours du pilote</h2><p>Rattachez les parcours créés avec ce navigateur à votre compte pour les gérer aussi depuis vos autres appareils.</p><button class="btn secondary" data-action="claim-trails">Rattacher mes anciens parcours</button></section>' : ''}<section class="activity-section"><div class="section-heading"><h2>Mes publications</h2>${publish('', 'Publier')}</div>${
    [...events, ...ads, ...trips]
      .filter((p) => p.mine)
      .map(
        (p) =>
          `<div class="activity-row"><div><strong>${esc(p.title)}</strong><span>${p.kind === 'events' ? 'Événement' : p.kind === 'trips' ? 'Trajet' : 'Annonce'}</span></div><button class="btn secondary" data-action="detail" data-id="${p.id}">Gérer</button></div>`,
      )
      .join('') || '<p>Aucune publication pour le moment.</p>'
  }<p><a href="#/balades" class="text-link">Retrouver et gérer mes parcours</a></p></section>${isAdmin() ? '<a class="btn primary" href="#/admin">Administrer le village</a>' : ''}`;
}
function profileSection() {
  return `<section class="activity-section profile-section" aria-labelledby="profile-heading"><div class="section-heading"><div><h2 id="profile-heading">Mon profil</h2><p>Un nom et un visage pour se reconnaître entre voisins.</p></div><button class="btn secondary" data-action="edit-profile">${icon('edit')}Modifier mon profil</button></div><div class="profile-summary">${avatar(user, 'large')}<div><strong>${esc(user.name)}</strong><p>Votre photo est visible par les habitants connectés.</p></div></div><a class="text-link" href="#/messages">${icon('chat')}Retrouver mes messages</a></section>`;
}
async function profileDialog() {
  user = await currentAccount();
  if (!user) {
    location.hash = '#/connexion';
    return;
  }
  profileDraft = { photo: user.photo, busy: false, request: 0 };
  modal(
    'Modifier mon profil',
    `<form id="profile-form" data-revision="${user.revision}"><label>Prénom et nom<input name="name" autocomplete="name" maxlength="100" value="${esc(user.name)}" aria-describedby="profile-name-help" required></label><p class="field-help" id="profile-name-help">Votre prénom accompagne vos prochaines publications.</p><div class="profile-photo-field"><div id="profile-photo-preview">${avatar(user, 'large')}</div><div><label>Photo de profil (facultative)<input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p id="profile-photo-status" class="field-help" role="status">JPEG, PNG ou WebP · 10 Mo maximum. La photo est recadrée au centre.</p><button class="text-link" type="button" data-action="remove-avatar" ${user.photo ? '' : 'hidden'}>Retirer la photo</button></div></div><p class="notice soft">Sans photo, votre initiale s’affiche. Votre photo est visible par les habitants connectés.</p>${formError()}<div class="form-footer"><button class="btn secondary" type="button" data-action="close">Annuler</button><button class="btn primary" type="submit">Enregistrer mon profil</button></div></form>`,
  );
}
function adminPage() {
  if (!isAdmin()) return empty('Accès réservé', 'Cette page est réservée aux administrateurs.');
  return `${title('PRENDRE SOIN DU VILLAGE', 'Administration', 'Gérez les publications et les rôles des habitants.')}<div class="admin-stats">${[
    [events.length, 'Événements'],
    [ads.length, 'Annonces'],
    [trips.length, 'Trajets'],
    [members.length, 'Comptes'],
  ]
    .map(([n, l]) => `<div><strong>${n}</strong><span>${l}</span></div>`)
    .join(
      '',
    )}</div><section class="activity-section"><div class="section-heading"><div><h2>Comptes et rôles</h2><p>Chaque nouvel inscrit est habitant. Le compte propriétaire reste protégé.</p></div><button class="btn secondary" data-action="refresh">Actualiser</button></div><div class="member-list">${members.map((m) => `<article class="member-row"><span class="avatar">${esc(m.name.slice(0, 1))}</span><div class="member-identity"><h3>${esc(m.name)}</h3><p>${esc(m.email)}</p></div>${badge(roleName(m.role), m.role === 'member' ? 'plain' : '')}${m.role === 'owner' ? '<span class="role-protected">Compte protégé</span>' : m.id === user.id ? '<span class="role-protected">Votre compte</span>' : `<button class="btn secondary small" data-action="change-role" data-id="${esc(m.id)}">${m.role === 'admin' ? 'Retirer le rôle admin' : 'Nommer admin'}</button>`}</article>`).join('') || '<p>Aucun compte à afficher pour le moment.</p>'}</div></section><section class="activity-section"><h2>Publications</h2><p><a href="#/balades" class="btn secondary">Gérer les parcours</a></p>${[...events, ...ads, ...trips].map((p) => `<div class="activity-row"><div><strong>${esc(p.title)}</strong><span>${p.kind === 'events' ? 'Événement' : p.kind === 'trips' ? 'Trajet' : 'Annonce'} · ${esc(p.authorName)}</span></div><button class="btn secondary" data-action="detail" data-id="${p.id}">Modifier ou retirer</button></div>`).join('') || '<p>Les publications des habitants apparaîtront ici.</p>'}</section>`;
}
function privacyPage() {
  return `${title('EN CONFIANCE', 'Vos données personnelles', 'Les informations utilisées par l’application.')}<article class="privacy-copy"><p>Consultez la <a href="./confidentialite.html">politique de confidentialité</a> pour connaître les données utilisées, leur visibilité, leur conservation et les modalités de demande de suppression.</p><p>Contact : <a href="mailto:marsupil@gmail.com">marsupil@gmail.com</a>.</p></article>`;
}
function modal(heading, content, wide = false) {
  focusBeforeDialog = document.activeElement;
  $('#modal-root').innerHTML =
    `<dialog class="modal ${wide ? 'wide' : ''}" aria-labelledby="dialog-title"><header class="modal-header"><h2 id="dialog-title">${heading}</h2><button class="icon-button" data-action="close" aria-label="Fermer">${icon('close')}</button></header><div class="modal-body">${content}</div></dialog>`;
  const d = $('dialog');
  d.showModal();
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal();
  });
  loadPhotos();
}
function closeModal(clearLink = true) {
  detailRequest++;
  if (clearLink && linkedEvent && notificationDestination(location.hash) === linkedEvent) {
    history.replaceState(null, '', '#/evenements');
    linkedEvent = '';
  }
  draft = null;
  profileDraft = null;
  const d = $('dialog');
  if (d) d.close();
  $('#modal-root').replaceChildren();
  if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus();
}
const formError = () => '<p class="form-error" role="alert" tabindex="-1"></p>';
function selectField(label, name, values, value) {
  return `<label><span class="field-label">${label}</span><span class="select-control"><select name="${name}">${values.map((v) => `<option ${v === value ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="select-value" aria-hidden="true">${esc(value || values[0])}</span></span></label>`;
}
async function detail(id, expectedHash = '') {
  const serial = ++detailRequest;
  const onDate = !expectedHash && route() === 'trajets' ? tripDate : '';
  const p = await request(
    'posts/' + encodeURIComponent(id) + (onDate ? '?date=' + encodeURIComponent(onDate) : ''),
  );
  if (serial !== detailRequest || (expectedHash && location.hash !== expectedHash)) return;
  if (expectedHash && p.kind !== 'events') throw new Error('Cet événement n’est plus disponible.');
  if (p.kind === 'trips') {
    modal(
      esc(p.title),
      `${tripDetail(p, onDate)}${p.canContact ? `<button class="btn primary" data-action="contact" data-id="${p.id}">${icon('chat')}Contacter ${esc(p.authorName || 'l’auteur')}</button>` : ''}${canManage(p) ? `<div class="management"><button class="text-link" data-action="edit" data-id="${p.id}">${icon('edit')}Modifier</button><button class="text-link danger" data-action="delete" data-id="${p.id}">${icon('trash')}Supprimer</button></div>` : ''}`,
    );
    return;
  }
  let extra;
  if (p.kind === 'events') {
    extra = `<div class="detail-facts"><span>${icon('calendar')}${dateText(p.date)} · ${p.date.split('T')[1] || 'Horaire à préciser'}</span><span>${icon('users')}${p.used}${p.capacity ? ' / ' + p.capacity : ''} personnes inscrites</span></div>`;
    if (p.participants)
      extra += `<section class="booking-box"><h3>Participants</h3>${p.participants.map((r) => `<div class="participant"><span>${esc(r.name)} · ${r.count} personne(s)</span>${badge(r.status === 'confirmed' ? 'Confirmé' : 'Liste d’attente', r.status === 'waiting' ? 'amber' : '')}</div>`).join('') || '<p>Aucune inscription.</p>'}</section>`;
    if (p.registration)
      extra += `<section class="booking-box"><h3>Votre inscription</h3><p>${p.registration.count} personne(s) · ${badge(p.registration.status === 'confirmed' ? 'Confirmé' : 'Liste d’attente', p.registration.status === 'waiting' ? 'amber' : '')}</p><button class="btn secondary" data-action="cancel-registration" data-id="${p.id}">Annuler mon inscription</button></section>`;
    else if (user)
      extra += `<form id="registration-form" data-id="${p.id}" class="booking-box"><h3>On vous garde une place ?</h3><p>Si les places manquent, votre groupe rejoint la liste d’attente.</p><div class="inline-form"><label>Nombre de personnes<input type="number" name="count" value="1" min="1" max="${Math.min(p.capacity || 50, 50)}" required></label><button class="btn primary" type="submit">M’inscrire</button></div>${formError()}</form>`;
    else
      extra += `<a class="btn primary" href="#/connexion?next=${encodeURIComponent('#/evenements?event=' + p.id)}">Me connecter pour participer</a>`;
  } else extra = `<p class="detail-price">${esc(p.price || 'À convenir')}</p>`;
  modal(
    esc(p.title),
    `<div class="detail-art">${visual(p, p.kind)}</div><div class="detail-top">${badge(p.category)}<span class="author">${esc(p.authorName || 'Un habitant')}</span></div><p class="detail-description">${esc(p.description)}</p><p class="meta">${icon('pin')}${esc(p.location)}</p>${p.contact ? `<section class="booking-box"><h3>Pour prendre contact</h3><p class="contact-text">${esc(p.contact)}</p></section>` : ''}${extra}${p.canContact ? `<button class="btn primary" data-action="contact" data-id="${p.id}">${icon('chat')}Contacter ${esc(p.authorName || 'l’auteur')}</button>` : ''}${canManage(p) ? `<div class="management"><button class="text-link" data-action="edit" data-id="${p.id}">${icon('edit')}Modifier</button><button class="text-link danger" data-action="delete" data-id="${p.id}">${icon('trash')}Supprimer</button></div>` : ''}`,
    true,
  );
}
async function openLinkedEvent() {
  const hash = notificationDestination(location.hash);
  if (loading || !hash.startsWith('#/evenements?event=')) return;
  if (linkedEvent === hash) return;
  linkedEvent = hash;
  const expected = location.hash;
  try {
    await detail(new URLSearchParams(hash.split('?')[1]).get('event'), expected);
  } catch (error) {
    if (location.hash !== expected || isSessionChange(error)) return;
    modal(
      'Événement indisponible',
      `<p role="alert">${esc(error.message)}</p><a class="btn secondary" href="#/evenements">Voir les événements</a>`,
    );
  }
}
async function compose(kind, id) {
  if (!user) {
    closeModal();
    location.hash = '#/connexion';
    return;
  }
  if (kind === 'trails') {
    closeModal();
    requestTrailCompose();
    location.hash = '#/balades';
    return;
  }
  if (!kind && !id) {
    modal(
      'Qu’aimeriez-vous partager ?',
      `<div class="compose-choices">${[
        ['events', 'calendar', 'Un événement'],
        ['trips', 'car', 'Un trajet'],
        ['ads', 'tag', 'Une petite annonce'],
        ['trails', 'trail', 'Une balade'],
      ]
        .map(
          ([k, i, l]) =>
            `<button data-action="compose" data-kind="${k}">${icon(i)}<strong>${l}</strong></button>`,
        )
        .join('')}</div>`,
    );
    return;
  }
  const p = id ? await request('posts/' + id) : {};
  kind = p.kind || kind;
  if (id && !canManage(p)) throw new Error('Vous ne pouvez pas modifier cette publication.');
  if (kind === 'trips') {
    modal(
      id ? 'Modifier le trajet' : 'Publier un trajet',
      `<form id="post-form" class="ride-form"><p class="fine">Partagé par ${esc(p.authorName || firstName())} · Visible par les habitants connectés</p>${tripFields(p)}${formError()}<div class="form-footer"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">${id ? 'Enregistrer' : 'Publier le trajet'}</button></div></form>`,
    );
    draft = { id: p.id || crypto.randomUUID(), kind, revision: p.revision, busy: false };
    return;
  }
  const fields =
    kind === 'events'
      ? `${selectField('Type de rendez-vous', 'category', EVENT_CATEGORIES, p.category || 'Rencontre')}<div class="form-grid"><label>Date<input type="date" name="date" value="${esc(p.date?.slice(0, 10) || '')}" required></label><label>Heure (facultative)<input type="time" name="eventTime" value="${esc(p.date?.split('T')[1] || '')}"></label><label>Capacité (0 = sans limite)<input type="number" name="capacity" min="0" max="500" value="${p.capacity ?? 0}" required></label></div>`
      : `<div class="form-grid">${selectField('Catégorie', 'category', AD_CATEGORIES, p.category || 'À donner')}<label>Prix, budget ou contrepartie (facultatif)<input name="price" value="${esc(p.price || '')}" maxlength="80" placeholder="Gratuit, 15 € / jour, troc…"></label></div>`;
  modal(
    id
      ? 'Modifier la publication'
      : kind === 'events'
        ? 'Proposer un événement'
        : 'Déposer une annonce',
    `<form id="post-form"><p class="fine">Partagé par ${esc(p.authorName || firstName())} · ${kind === 'events' ? 'Visible par tous' : 'Visible par les habitants connectés'}</p><label>Titre<input name="title" value="${esc(p.title || '')}" required minlength="4" maxlength="100"></label>${fields}<label>Lieu<input name="location" value="${esc(p.location || 'Prémeyzel')}" required maxlength="120"></label><label>Description (facultative)<textarea name="description" rows="4" maxlength="2000">${esc(p.description || '')}</textarea></label><label>Comment vous contacter (facultatif)<input name="contact" value="${esc(p.contact || '')}" maxlength="240" placeholder="Le moyen de contact que vous souhaitez partager"></label><p class="fine">Ces coordonnées seront visibles avec votre publication. Les habitants peuvent aussi vous écrire via la messagerie de l’application.</p><fieldset class="photo-editor"><legend>Photo (facultative)</legend><div id="photo-preview" class="photo-preview">${visual(p, kind)}</div><label class="photo-file-label">Ajouter ou remplacer une photo<input type="file" id="post-photo" accept="image/jpeg,image/png,image/webp"></label><button class="btn secondary" type="button" data-action="remove-photo" ${p.photo ? '' : 'hidden'}>Retirer la photo</button><p class="fine">JPEG, PNG ou WebP · 10 Mo maximum. Sans photo, une illustration s’affiche automatiquement.</p><p id="photo-status" role="status"></p></fieldset>${formError()}<div class="form-footer"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">${id ? 'Enregistrer' : 'Publier pour le village'}</button></div></form>`,
    true,
  );
  draft = {
    id: p.id || crypto.randomUUID(),
    kind,
    revision: p.revision,
    photo: p.photo || null,
    busy: false,
    request: 0,
  };
}
async function removeDialog(id) {
  const p = await request('posts/' + id);
  if (!canManage(p)) throw new Error('Cette action n’est pas autorisée.');
  modal(
    'Supprimer cette publication ?',
    `<p><strong>${esc(p.title)}</strong></p><p>Elle ne sera plus visible dans l’application.${p.kind === 'events' ? ' Les inscriptions seront annulées.' : ''}</p><form id="delete-form" data-id="${p.id}" data-revision="${p.revision}">${formError()}<div class="form-footer"><button class="btn secondary" type="button" data-action="close">Conserver</button><button class="btn danger-fill" type="submit">Confirmer la suppression</button></div></form>`,
  );
}
function roleDialog(id) {
  const member = members.find((m) => m.id === id);
  if (!member) return;
  const newRole = member.role === 'admin' ? 'member' : 'admin';
  modal(
    newRole === 'admin' ? 'Nommer administrateur ?' : 'Retirer le rôle administrateur ?',
    `<p><strong>${esc(member.name)}</strong> · ${esc(member.email)}</p><p>${newRole === 'admin' ? 'Cette personne pourra modifier ou retirer toutes les publications et attribuer des rôles administrateurs.' : 'Cette personne pourra gérer uniquement ses propres publications.'}</p><form id="role-form" data-id="${esc(member.id)}" data-role="${newRole}" data-revision="${member.revision}">${formError()}<div class="form-footer"><button class="btn secondary" type="button" data-action="close">Annuler</button><button class="btn primary" type="submit">Confirmer le changement</button></div></form>`,
  );
}
function clearSessionUI() {
  clearFeedbackDraft();
  user = null;
  events = [];
  ads = [];
  trips = [];
  tripDate = '';
  filteredTripDate = '';
  filteredTrips = [];
  clearTimeout(tripExpiryTimer);
  members = [];
  clearPhotos();
  closeModal(false);
  linkedEvent = '';
  setMessagingAccount(null, { avatar, loadPhotos, toast, modal, closeModal, openPost: detail });
  setTrailAccount(null);
  unmountTrails();
}
function scheduleTripExpiry() {
  clearTimeout(tripExpiryTimer);
  const next = Math.min(...[...trips, ...filteredTrips].map((trip) => trip.departureAt));
  if (!Number.isFinite(next)) return;
  tripExpiryTimer = setTimeout(
    () => {
      trips = trips.filter((trip) => trip.departureAt > Date.now());
      filteredTrips = filteredTrips.filter((trip) => trip.departureAt > Date.now());
      if (!hasActiveInput()) render();
      refreshData(!hasActiveInput());
    },
    Math.max(50, Math.min(2147483647, next - Date.now() + 50)),
  );
}
function refreshData(redraw = true) {
  const serial = sessionGeneration();
  if (refreshing?.serial === serial) {
    refreshing.redraw ||= redraw;
    return refreshing.promise;
  }
  const job = { serial, redraw, date: tripDate };
  refreshing = job;
  job.promise = (async () => {
    try {
      const previous = user?.id,
        next = await currentAccount();
      if (serial !== sessionGeneration()) return;
      if (previous !== next?.id) clearSessionUI();
      user = next;
      job.date = tripDate;
      const results = await Promise.allSettled([
        allPages('posts?kind=events', 'posts'),
        user ? allPages('posts?kind=ads', 'posts') : Promise.resolve([]),
        user ? allPages('posts?kind=trips', 'posts') : Promise.resolve([]),
        isAdmin() ? allPages('admin/users', 'users') : Promise.resolve([]),
        user && job.date
          ? allPages('posts?kind=trips&date=' + encodeURIComponent(job.date), 'posts')
          : Promise.resolve([]),
      ]);
      if (serial !== sessionGeneration()) return;
      [events, ads, trips, members] = results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : [events, ads, trips, members][i],
      );
      if (job.date === tripDate) {
        filteredTrips = results[4].status === 'fulfilled' ? results[4].value : [];
        filteredTripDate = job.date;
      }
      const failed = results.find((r) => r.status === 'rejected');
      loadError = failed && authConfig()?.accountsEnabled ? failed.reason.message : '';
    } catch (error) {
      if (serial === sessionGeneration() && !isSessionChange(error)) {
        clearSessionUI();
        loadError = error.message;
      }
    } finally {
      if (refreshing === job) {
        refreshing = null;
        if (serial === sessionGeneration()) {
          loading = false;
          scheduleTripExpiry();
          if (job.date !== tripDate) refreshData(job.redraw);
          if (job.redraw) render();
        }
      }
    }
  })();
  return job.promise;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const { action, id, kind, value, provider } = b.dataset;
  try {
    if (action === 'close') closeModal();
    if (action === 'sign-in') {
      b.disabled = true;
      try {
        await signIn(provider);
      } finally {
        b.disabled = false;
      }
    }
    if (action === 'sign-out') {
      b.disabled = true;
      await disconnectPush(true);
      await signOut();
      clearSessionUI();
      render();
      location.hash = '#/connexion';
      await refreshData();
    }
    if (action === 'compose') await compose(kind);
    if (action === 'detail') await detail(id);
    if (action === 'edit') await compose('', id);
    if (action === 'delete') await removeDialog(id);
    if (action === 'change-role') roleDialog(id);
    if (action === 'edit-profile') await profileDialog();
    if (action === 'feedback') openFeedback(user, route(), { modal, refreshInbox });
    if (action === 'contact') {
      b.disabled = true;
      await openContact({ postId: id });
    }
    if (action === 'remove-avatar' && profileDraft) {
      profileDraft.request++;
      profileDraft.photo = null;
      profileDraft.busy = false;
      $('#profile-photo-preview').innerHTML = avatar({ name: user.name }, 'large');
      $('#profile-photo').value = '';
      $('#profile-photo-status').textContent = 'Votre initiale sera affichée.';
      $('#profile-form [type="submit"]').disabled = false;
      b.hidden = true;
    }
    if (action === 'filter') {
      filter = value;
      render();
      Array.from(document.querySelectorAll('[data-action="filter"]'))
        .find((button) => button.dataset.value === value)
        ?.focus({ preventScroll: true });
    }
    if (action === 'reset-search') {
      query = '';
      filter = 'Tout';
      tripDate = '';
      filteredTripDate = '';
      filteredTrips = [];
      render();
      $('#search')?.focus({ preventScroll: true });
    }
    if (action === 'clear-trip-date') {
      tripDate = '';
      filteredTripDate = '';
      filteredTrips = [];
      render();
      $('[data-action="clear-trip-date"]')?.focus({ preventScroll: true });
    }
    if (action === 'refresh') await refreshData();
    if (action === 'cancel-registration') {
      b.disabled = true;
      await request('posts/' + id + '/registrations', { method: 'DELETE' });
      await refreshData();
      await detail(id);
    }
    if (action === 'claim-trails') {
      b.disabled = true;
      const result = await claimLegacyTrails();
      render();
      toast(result.claimed + ' parcours rattaché(s) à votre compte.');
    }
    if (action === 'remove-photo' && draft) {
      draft.request++;
      draft.photo = null;
      draft.busy = false;
      $('#photo-preview').innerHTML = visual({}, draft.kind);
      b.hidden = true;
      $('#post-photo').value = '';
      $('#photo-status').textContent = 'Illustration par défaut';
      $('#post-form [type="submit"]').disabled = false;
    }
    if (action === 'install') {
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
      } else
        modal(
          'Le village à portée de main',
          '<p>Sur iPhone, ouvrez le menu Partager de Safari, puis « Sur l’écran d’accueil ». Sur Android, utilisez « Installer l’application » dans le menu de votre navigateur.</p>',
        );
    }
  } catch (error) {
    b.disabled = false;
    const target = $('.modal .form-error') || $('#auth-error');
    if (target) target.textContent = error.message;
    else toast(error.message);
  }
});
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (
    !['post-form', 'registration-form', 'delete-form', 'role-form', 'profile-form'].includes(
      form.id,
    )
  )
    return;
  e.preventDefault();
  const button = form.querySelector('[type="submit"]'),
    error = form.querySelector('.form-error');
  if (form.dataset.saving || draft?.busy || profileDraft?.busy) return;
  form.dataset.saving = 'true';
  button.disabled = true;
  error.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  try {
    let detailId = null;
    if (form.id === 'profile-form') {
      user = (
        await request('me', {
          method: 'PATCH',
          body: {
            name: data.name,
            photo: profileDraft?.photo ?? null,
            revision: Number(form.dataset.revision),
          },
        })
      ).user;
      closeModal();
      toast('Votre profil a été enregistré.');
    }
    if (form.id === 'post-form') {
      const currentDraft = draft;
      if (!currentDraft) return;
      const body = { ...data, ...currentDraft };
      if (body.kind === 'events') {
        body.date = data.date + (data.eventTime ? 'T' + data.eventTime : '');
        body.capacity = Number(data.capacity);
      }
      if (body.kind === 'trips') Object.assign(body, tripInput(new FormData(form)));
      await request(currentDraft.revision ? 'posts/' + currentDraft.id : 'posts', {
        method: currentDraft.revision ? 'PATCH' : 'POST',
        body,
      });
      closeModal();
      location.hash =
        currentDraft.kind === 'events'
          ? '#/evenements'
          : currentDraft.kind === 'trips'
            ? '#/trajets'
            : '#/annonces';
      query = '';
      filter = 'Tout';
      toast('Publication enregistrée pour le village.');
    }
    if (form.id === 'registration-form') {
      await request('posts/' + form.dataset.id + '/registrations', {
        method: 'POST',
        body: { count: Number(data.count) },
      });
      detailId = form.dataset.id;
      closeModal();
      toast('Votre inscription a été enregistrée.');
    }
    if (form.id === 'delete-form') {
      await request('posts/' + form.dataset.id, {
        method: 'DELETE',
        body: { revision: Number(form.dataset.revision) },
      });
      closeModal();
      toast('Publication retirée.');
    }
    if (form.id === 'role-form') {
      await request('admin/users/' + encodeURIComponent(form.dataset.id), {
        method: 'PATCH',
        body: { role: form.dataset.role, revision: Number(form.dataset.revision) },
      });
      closeModal();
      toast('Rôle mis à jour.');
    }
    await refreshData();
    if (detailId) await detail(detailId);
  } catch (err) {
    if (form.isConnected) {
      error.textContent = err.message;
      error.focus();
      button.disabled = false;
    } else if (!isSessionChange(err)) toast(err.message);
  } finally {
    delete form.dataset.saving;
  }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'trip-date-filter') {
    tripDate = e.target.value;
    filteredTripDate = '';
    filteredTrips = [];
    render();
    await refreshData();
    return;
  }
  if (e.target.closest('.ride-form')) updateTripForm(e.target.form);
  if (e.target instanceof HTMLSelectElement) {
    const display = e.target.parentElement.querySelector('.select-value');
    if (display) display.textContent = e.target.selectedOptions[0]?.textContent || '';
  }
  if (e.target.id === 'profile-photo' && profileDraft) {
    const current = profileDraft,
      file = e.target.files?.[0];
    if (!file) return;
    const serial = ++current.request;
    current.busy = true;
    $('#profile-form [type="submit"]').disabled = true;
    $('#profile-photo-status').textContent = 'Préparation de la photo…';
    try {
      const photo = await preparePhoto(file, { maxDimension: 512, square: true });
      if (profileDraft !== current || serial !== current.request) return;
      current.photo = photo;
      $('#profile-photo-preview').innerHTML = avatar({ name: user.name, photo }, 'large');
      $('[data-action="remove-avatar"]').hidden = false;
      $('#profile-photo-status').textContent = 'Votre photo est prête.';
    } catch (error) {
      if (profileDraft === current && serial === current.request)
        $('#profile-photo-status').textContent = error.message;
    } finally {
      if (profileDraft === current && serial === current.request) {
        current.busy = false;
        $('#profile-form [type="submit"]').disabled = false;
        e.target.value = '';
      }
    }
    return;
  }
  if (e.target.id !== 'post-photo' || !draft) return;
  const currentDraft = draft,
    file = e.target.files?.[0];
  if (!file) return;
  const requestId = ++draft.request;
  draft.busy = true;
  $('#post-form [type="submit"]').disabled = true;
  $('#photo-status').textContent = 'Préparation de la photo…';
  try {
    const photo = await preparePhoto(file);
    if (draft !== currentDraft || requestId !== draft.request) return;
    draft.photo = photo;
    $('#photo-preview').innerHTML = visual({ photo }, draft.kind);
    $('[data-action="remove-photo"]').hidden = false;
    $('#photo-status').textContent = 'Votre photo est prête.';
  } catch (error) {
    if (draft === currentDraft) $('#photo-status').textContent = error.message;
  } finally {
    if (draft === currentDraft && requestId === draft.request) {
      draft.busy = false;
      $('#post-form [type="submit"]').disabled = false;
      e.target.value = '';
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    const cursor = e.target.selectionStart;
    query = e.target.value;
    render();
    $('#search')?.focus();
    try {
      $('#search').setSelectionRange(cursor, cursor);
    } catch {}
  }
});
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button === 0 && e.target instanceof HTMLSelectElement)
      e.target.dataset.pointerFocus = 'true';
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key))
      document
        .querySelectorAll('select[data-pointer-focus]')
        .forEach((s) => delete s.dataset.pointerFocus);
  },
  true,
);
document.addEventListener(
  'focusout',
  (e) => {
    if (e.target instanceof HTMLSelectElement) delete e.target.dataset.pointerFocus;
  },
  true,
);
window.addEventListener('hashchange', () => {
  closeModal(false);
  linkedEvent = '';
  query = '';
  filter = 'Tout';
  tripDate = '';
  filteredTripDate = '';
  filteredTrips = [];
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#main').focus({ preventScroll: true });
  if (route() === 'admin') refreshData();
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
function hasActiveInput() {
  return (
    !!document.querySelector('dialog[open]') ||
    ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
    route() === 'messages'
  );
}
window.addEventListener('online', () => refreshData(!hasActiveInput()));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && route() === 'trajets') refreshData(!hasActiveInput());
});
window.addEventListener('offline', () => {
  if (hasActiveInput())
    toast('Hors connexion. Votre saisie reste ouverte ; reconnectez-vous pour l’envoyer.');
  else render();
});
let authSubject;
function handleAuthChange(event, subject) {
  const changed =
    event === 'SIGNED_OUT' ||
    (event === 'SIGNED_IN' && authSubject !== subject && user?.id !== 'supabase:' + subject);
  authSubject = subject;
  if (changed) {
    clearSessionUI();
    render();
  }
  if (event === 'SIGNED_OUT') disconnectPush(true).catch(() => {});
  // Supabase can repeat SIGNED_IN on focus. Token refresh must not destroy a
  // resident's open GPX/photo form or replace the message they are composing.
  if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && !changed)) return;
  refreshData();
}
render();
try {
  await initializeAuth(handleAuthChange);
  await refreshData();
} catch (error) {
  loading = false;
  authError = error.message;
  loadError = error.message;
  render();
}
setInterval(() => {
  if (
    !document.querySelector('#email-auth-form') &&
    !document.hidden &&
    navigator.onLine &&
    !document.querySelector('dialog[open]') &&
    !['balades', 'messages'].includes(route()) &&
    !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  )
    refreshData();
}, 30000);
