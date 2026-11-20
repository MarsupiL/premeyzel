import { offlineTrails } from './trail-offline.js';

const size = (bytes) =>
  `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
export function mountOfflineControls(container, trail, { onChange = () => {} } = {}) {
  container.innerHTML = `<details class="offline-controls"><summary>Carte hors ligne</summary><p class="offline-status" role="status">Vérification de la copie locale…</p><p>Enregistrez le plan IGN et ses courbes de niveau autour du parcours avant de partir. Gardez cette fenêtre ouverte pendant le téléchargement.</p><div class="button-row"><button class="btn secondary" type="button" data-save-map>Télécharger hors ligne</button><button class="btn secondary" type="button" data-remove-map hidden>Retirer la copie</button><button class="btn secondary" type="button" data-cancel-map hidden>Annuler</button></div><progress aria-label="Téléchargement de la carte" hidden></progress><p>Le GPS fonctionne sans Internet : gardez l’app ouverte et l’écran allumé. Les zones de chasse ne peuvent pas être actualisées hors ligne. Les cartes sont conservées sur cet appareil ; son système peut libérer ce stockage.</p></details>`;
  const summary = container.querySelector('summary');
  const status = container.querySelector('.offline-status');
  const save = container.querySelector('[data-save-map]');
  const remove = container.querySelector('[data-remove-map]');
  const cancel = container.querySelector('[data-cancel-map]');
  const progress = container.querySelector('progress');
  let controller = null,
    disposed = false,
    pack = null;
  function buttons() {
    save.disabled = !!controller || !navigator.onLine;
    remove.hidden = !pack;
    remove.disabled = !!controller;
    cancel.hidden = !controller;
    progress.hidden = !controller;
    save.textContent = pack ? 'Actualiser la copie' : 'Télécharger hors ligne';
  }
  async function refresh() {
    const packs = await offlineTrails.list();
    if (disposed) return;
    pack = packs.find((p) => p.trail.id === trail.id) || null;
    const outdated = pack && pack.trail.revision !== trail.revision;
    summary.textContent = pack
      ? outdated
        ? 'Carte hors ligne · mise à jour disponible'
        : 'Carte disponible hors ligne'
      : 'Télécharger la carte hors ligne';
    status.textContent = pack
      ? `Copie du ${new Date(pack.savedAt).toLocaleDateString('fr-FR')} · ${size(pack.bytes)}. ${outdated ? 'Le parcours a changé : actualisez la copie avant de partir.' : 'Parcours, plan et courbes de niveau enregistrés.'}`
      : navigator.onLine
        ? 'Aucune carte enregistrée pour ce parcours.'
        : 'Reconnectez-vous pour télécharger cette carte.';
    buttons();
    onChange(packs, pack);
  }
  save.onclick = async () => {
    controller = new AbortController();
    const signal = controller.signal;
    buttons();
    try {
      if (!navigator.serviceWorker?.controller)
        throw new Error(
          'Rechargez l’application une fois en ligne pour activer le mode hors connexion.',
        );
      // Browsers may decline persistence. A download still works, with the
      // storage limitation explained above; never claim permanent retention.
      navigator.storage?.persist?.().catch(() => {});
      await offlineTrails.save(trail, {
        signal,
        onProgress: ({ done, total, bytes }) => {
          if (disposed) return;
          progress.max = total;
          progress.value = done;
          status.textContent = `Téléchargement : ${Math.floor((done * 100) / total)} % · ${size(bytes)}`;
        },
      });
      controller = null;
      await refresh();
    } catch (error) {
      if (!disposed)
        status.textContent = signal.aborted
          ? 'Téléchargement annulé. Toute copie précédente est conservée.'
          : error.name === 'TypeError' || error.name === 'TimeoutError'
            ? 'Connexion interrompue. La nouvelle carte n’a pas été enregistrée ; réessayez en ligne.'
            : error.message;
    } finally {
      controller = null;
      if (!disposed) buttons();
    }
  };
  remove.onclick = async () => {
    remove.disabled = true;
    try {
      await offlineTrails.remove(trail.id);
      await refresh();
    } catch {
      status.textContent = 'Impossible de retirer la copie. Réessayez.';
    } finally {
      buttons();
    }
  };
  cancel.onclick = () => controller?.abort();
  const connectionChanged = () => {
    buttons();
    if (!controller) refresh().catch(() => {});
  };
  window.addEventListener('online', connectionChanged);
  window.addEventListener('offline', connectionChanged);
  refresh().catch(() => {
    status.textContent = 'Le stockage hors ligne est indisponible sur cet appareil.';
    save.disabled = true;
  });
  return () => {
    disposed = true;
    controller?.abort();
    window.removeEventListener('online', connectionChanged);
    window.removeEventListener('offline', connectionChanged);
  };
}
