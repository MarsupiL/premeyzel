// Finish an app-shell update before importing modules, so an older offline cache
// cannot mix an old API client with the new account interface.
if('serviceWorker' in navigator){
 try{
  const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  await registration.update();
  const worker=registration.installing||registration.waiting;
  if(worker&&worker.state!=='activated'&&worker.state!=='redundant')await new Promise(resolve=>{
   const timeout=setTimeout(resolve,15000);
   worker.addEventListener('statechange',()=>{if(['activated','redundant'].includes(worker.state)){clearTimeout(timeout);resolve();}});
  });
 }catch{/* Online use remains possible when offline storage is unavailable. */}
}
// The rollout switch prevents a half-configured sign-in from replacing the working pilot.
const preview=new URLSearchParams(location.search).has('accounts-preview');
let liveAccounts=false;
try{
 const response=await fetch('https://premeyzel-parcours.mathias790372.chatgpt.site/api/auth/config',{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(response.ok)liveAccounts=(await response.json()).accountsEnabled===true;
 if(liveAccounts)localStorage.setItem('premeyzel-accounts-launched','true');
}catch{liveAccounts=localStorage.getItem('premeyzel-accounts-launched')==='true';}
try{if(liveAccounts||preview)await import('./resident-app.js');else await import('./app.js');}catch{document.querySelector('#app').innerHTML='<main class="empty"><h1>Une mise à jour est disponible</h1><p>Rechargez la page pour ouvrir la nouvelle version.</p><button class="btn primary" id="reload-app">Recharger</button></main>';document.querySelector('#reload-app').onclick=()=>location.reload();}
