import { escapeHTML as esc } from './html.js';
import { request, isSessionChange } from './api-client.js';

const pages = {
  accueil: 'Le village',
  evenements: 'Événements',
  trajets: 'Trajets',
  annonces: 'Petites annonces',
  balades: 'Balades',
  messages: 'Messages',
  compte: 'Mon compte',
  admin: 'Administration',
};
let draft = null;
export function clearFeedbackDraft() {
  draft = null;
}

export function feedbackForm(value, page) {
  return `<form id="feedback-form"><p>Un souci ou une idée pour améliorer Prémeyzel ? Écrivez directement à Mathias.</p><fieldset class="feedback-types"><legend>Je souhaite…</legend><label><input type="radio" name="category" value="problem" ${value.category === 'problem' ? 'checked' : ''}>Signaler un problème</label><label><input type="radio" name="category" value="idea" ${value.category === 'idea' ? 'checked' : ''}>Proposer une idée</label></fieldset><label for="feedback-body">Votre message</label><textarea id="feedback-body" name="body" rows="6" maxlength="3500" required aria-describedby="feedback-help feedback-privacy" placeholder="Décrivez votre problème ou votre idée…">${esc(value.body)}</textarea><p id="feedback-help" class="field-help">Pour un problème, précisez ce qui s’est passé et comment le reproduire. 3 500 caractères maximum.</p><p class="field-help">Page concernée : ${esc(pages[page])}.</p><p id="feedback-privacy" class="notice soft">Votre nom, votre message et le nom de cette page sont transmis à Mathias dans sa messagerie et par e-mail. Vous pourrez poursuivre l’échange dans Mes messages.</p><p class="form-error" role="alert" tabindex="-1"></p><div class="form-footer"><button class="btn secondary" type="button" data-action="close">Annuler</button><button class="btn primary" type="submit">Envoyer à Mathias</button></div></form>`;
}

export function openFeedback(user, page, ui) {
  if (!user) {
    location.hash = '#/connexion';
    return;
  }
  if (!draft || draft.owner !== user.id)
    draft = {
      owner: user.id,
      id: crypto.randomUUID(),
      category: 'problem',
      body: '',
      page: Object.hasOwn(pages, page) ? page : 'accueil',
    };
  // Each open form owns its snapshot, including while an older request finishes.
  draft = { ...draft };
  const value = draft;
  ui.modal('Un problème ou une idée ?', feedbackForm(value, value.page));
  const form = document.querySelector('#feedback-form');
  const update = () => {
    if (form.dataset.saving) return;
    const data = new FormData(form);
    // A new payload gets a new retry ID; identical retries reuse the original one.
    if (value.body !== data.get('body') || value.category !== data.get('category'))
      value.id = crypto.randomUUID();
    value.body = data.get('body');
    value.category = data.get('category');
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.saving) return;
    update();
    const error = form.querySelector('.form-error');
    if (!value.body.trim()) {
      error.textContent = 'Écrivez votre message avant de l’envoyer.';
      error.focus();
      return;
    }
    form.dataset.saving = 'true';
    error.textContent = '';
    const fields = [...form.querySelectorAll('input,textarea,button[type="submit"]')];
    fields.forEach((field) => {
      field.disabled = true;
    });
    try {
      const result = await request('feedback', {
        method: 'POST',
        body: { id: value.id, category: value.category, body: value.body, page: value.page },
      });
      if (draft === value) draft = null;
      if (!form.isConnected) return;
      document.querySelector('#dialog-title').textContent = 'Merci pour votre retour';
      form.innerHTML = `<p>Votre message a bien été enregistré pour Mathias.</p><p>Retrouvez cet échange et sa réponse dans votre messagerie.</p><div class="form-footer"><button class="btn secondary" type="button" data-action="close">Fermer</button><a class="btn primary" href="#/messages?c=${esc(result.conversationId)}">Voir la conversation</a></div>`;
      form.querySelector('a').focus();
      ui.refreshInbox();
    } catch (err) {
      if (form.isConnected && !isSessionChange(err)) {
        error.textContent = err.message;
        error.focus();
      }
    } finally {
      delete form.dataset.saving;
      fields.forEach((field) => {
        field.disabled = false;
      });
    }
  });
}
