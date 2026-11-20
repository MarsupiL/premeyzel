// HTML, styles and Leaflet load before this module. If the offline worker changes
// during startup, reload the whole shell before importing the application so its
// scripts cannot run with styles from the previous release (including map sizes).
let reloadShell = false;
if ('serviceWorker' in navigator) {
  const previousController = navigator.serviceWorker.controller;
  const controllerChanged = () => {
    if (previousController && navigator.serviceWorker.controller !== previousController)
      reloadShell = true;
  };
  navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      updateViaCache: 'none',
    });
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (worker && worker.state !== 'activated' && worker.state !== 'redundant')
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 15000);
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    // Activation can finish just before clients.claim() changes this document's
    // controller. A navigation will already use the newly activated worker.
    if (
      previousController &&
      registration.active?.state === 'activated' &&
      registration.active !== previousController
    )
      reloadShell = true;
  } catch {
    /* Online use remains possible when offline storage is unavailable. */
  } finally {
    controllerChanged();
    navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
  }
}
// The resident service is launched. A failed config request must never expose
// the retired, fictional demo as if it were the live village.
if (reloadShell) location.reload();
else {
  try {
    await import('./resident-app.js');
  } catch {
    document.querySelector('#app').innerHTML =
      '<main class="empty"><h1>Une mise à jour est disponible</h1><p>Rechargez la page pour ouvrir la nouvelle version.</p><button class="btn primary" id="reload-app">Recharger</button></main>';
    document.querySelector('#reload-app').onclick = () => location.reload();
  }
}
