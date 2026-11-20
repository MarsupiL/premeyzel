import { escapeHTML as esc } from './html.js';
import {
  authConfig,
  isPasswordRecovery,
  signInWithEmail,
  registerWithEmail,
  requestPasswordReset,
  resendConfirmation,
  updateRecoveredPassword,
} from './auth.js';

export const authMode = () =>
  new URLSearchParams(location.hash.split('?')[1] || '').get('mode') || 'login';
let busy = false;
export const authFormBusy = () => busy;
const link = (mode, label) =>
  `<a class="text-link" href="#/connexion${mode === 'login' ? '' : '?mode=' + mode}">${label}</a>`;
export function emailForm() {
  const config = authConfig(),
    available = config?.accountsEnabled && config?.configured,
    delivery = available && config?.emailDeliveryEnabled,
    mode = authMode();
  const reset = mode === 'reset',
    signup = mode === 'signup',
    forgot = mode === 'forgot',
    resend = mode === 'resend',
    emailOnly = forgot || resend;
  if (reset && !isPasswordRecovery())
    return `<div class="notice" role="status">Le lien de réinitialisation est absent, expiré ou a déjà été utilisé. Ouvrez le lien dans le navigateur où vous l’avez demandé.</div>${link('forgot', 'Demander un nouveau lien')}`;
  const enabled = available && (reset || (!signup && !emailOnly) || delivery);
  return `<div class="auth-divider"><span>${reset ? 'Nouveau mot de passe' : signup ? 'Créer un compte par e-mail' : forgot ? 'Mot de passe oublié' : resend ? 'Confirmer mon adresse e-mail' : 'Ou avec votre adresse e-mail'}</span></div>
 ${!delivery && (signup || emailOnly) ? '<p class="notice" role="status">Les inscriptions et les e-mails de récupération ouvrent bientôt. Vous pouvez déjà vous connecter avec Google.</p>' : ''}
 <form id="email-auth-form" data-mode="${esc(mode)}" class="email-auth-form">
 ${signup ? '<label for="auth-name">Votre nom</label><input id="auth-name" name="name" autocomplete="name" required maxlength="80">' : ''}
 ${!reset ? '<label for="auth-email">Adresse e-mail</label><input id="auth-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254">' : ''}
 ${!emailOnly ? `<label for="auth-password">${reset ? 'Nouveau mot de passe' : 'Mot de passe'}</label><input id="auth-password" name="password" type="password" autocomplete="${signup || reset ? 'new-password' : 'current-password'}" required ${signup || reset ? 'minlength="10" aria-describedby="password-help"' : ''}>${signup || reset ? '<p class="field-help" id="password-help">Au moins 10 caractères. Une phrase personnelle est plus facile à retenir.</p>' : ''}` : ''}
 ${reset ? '<label for="auth-password-confirm">Confirmer le mot de passe</label><input id="auth-password-confirm" name="confirmation" type="password" autocomplete="new-password" required>' : ''}
 ${emailOnly ? '<p class="field-help">Nous vous enverrons un lien à ouvrir dans ce même navigateur. Pensez à vérifier vos courriers indésirables.</p>' : ''}
 <p id="email-auth-error" class="form-error" role="alert" tabindex="-1"></p><p id="email-auth-status" class="notice" role="status" tabindex="-1" hidden></p>
 <button class="btn primary" type="submit" ${enabled ? '' : 'disabled'}>${signup ? 'Créer mon compte' : forgot ? 'Recevoir un lien' : resend ? 'Renvoyer le lien' : reset ? 'Enregistrer le mot de passe' : 'Me connecter'}</button>
 </form><div class="auth-links">${mode === 'login' ? `${link('forgot', 'Mot de passe oublié ?')}${link('signup', 'Créer un compte')}${link('resend', 'Renvoyer le lien de confirmation')}` : link('login', 'Retour à la connexion')}</div>`;
}
export function mountEmailForm(onSignedIn) {
  const form = document.querySelector('#email-auth-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const mode = form.dataset.mode,
      fields = form.elements,
      error = form.querySelector('#email-auth-error'),
      status = form.querySelector('#email-auth-status'),
      button = form.querySelector('[type=submit]');
    error.textContent = '';
    status.hidden = true;
    if (mode === 'reset' && fields.password.value !== fields.confirmation.value) {
      error.textContent = 'Les deux mots de passe ne correspondent pas.';
      fields.confirmation.focus();
      return;
    }
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    let signedIn = false;
    try {
      if (mode === 'signup') {
        const result = await registerWithEmail(
          fields.name.value,
          fields.email.value,
          fields.password.value,
        );
        signedIn = !!result.session;
        status.textContent =
          'Si cette adresse peut être inscrite, un lien de confirmation va vous parvenir. Ouvrez-le dans ce même navigateur. Si vous avez déjà un compte, connectez-vous ou utilisez « Mot de passe oublié ». ';
      } else if (mode === 'forgot') {
        await requestPasswordReset(fields.email.value);
        status.textContent =
          'Si un compte correspond à cette adresse, un lien va vous parvenir. Ouvrez-le dans ce même navigateur pour choisir votre mot de passe.';
      } else if (mode === 'resend') {
        await resendConfirmation(fields.email.value);
        status.textContent =
          'Si cette adresse attend une confirmation, un nouveau lien va vous parvenir. Ouvrez-le dans ce même navigateur.';
      } else if (mode === 'reset') {
        await updateRecoveredPassword(fields.password.value);
        signedIn = true;
      } else {
        await signInWithEmail(fields.email.value, fields.password.value);
        signedIn = true;
      }
      if (!signedIn) {
        status.hidden = false;
        status.focus();
      }
    } catch (failure) {
      error.textContent = failure.message;
      error.focus();
    } finally {
      // Passwords remain only in the SDK request; never keep them in draft state or storage.
      if (fields.password) fields.password.value = '';
      if (fields.confirmation) fields.confirmation.value = '';
      busy = false;
      form.removeAttribute('aria-busy');
      button.disabled = false;
    }
    if (signedIn)
      await onSignedIn(mode === 'reset' ? 'Votre nouveau mot de passe a été enregistré.' : '');
  });
}
