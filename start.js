// Finish an app-shell update before importing modules, so an older offline cache
// cannot mix an old API client with the new account interface.
if ('serviceWorker' in navigator) {
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
  } catch {
    /* Online use remains possible when offline storage is unavailable. */
  }
}
// The resident service is launched. A failed config request must never expose
// the retired, fictional demo as if it were the live village.
try {
  await import('./resident-app.js');
} catch {
  document.querySelector('#app').innerHTML =
    '<main class="empty"><h1>Une mise à jour est disponible</h1><p>Rechargez la page pour ouvrir la nouvelle version.</p><button class="btn primary" id="reload-app">Recharger</button></main>';
  document.querySelector('#reload-app').onclick = () => location.reload();
}
