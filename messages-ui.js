import {request,allPages} from './api-client.js';
import {icon} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
let viewer=null,ui={},root=null,epoch=0,timer=null,inbox=[],drafts=new Map(),messages=[],nextBefore=null,peer=null,context=null,activeId='',busy=false,polling=false,inboxRequest=0;
const $=s=>root?.querySelector(s);
export function setMessagingAccount(user,callbacks){
 if(viewer?.id!==user?.id){unmountMessages();inbox=[];drafts.clear();inboxRequest++;}
 viewer=user;ui=callbacks;updateBadges();
}
function updateBadges(){const count=inbox.reduce((n,c)=>n+c.unread,0);document.querySelectorAll('[data-message-count]').forEach(el=>{el.textContent=count>99?'99+':String(count);el.hidden=!count;});document.querySelectorAll('[data-message-link]').forEach(el=>el.setAttribute('aria-label',count?`Messages, ${count} non lu${count>1?'s':''}`:'Messages'));}
export async function refreshInbox(){
 if(!viewer)return;const owner=viewer.id,serial=++inboxRequest;
 try{const rows=await allPages('conversations','conversations');if(owner!==viewer?.id||serial!==inboxRequest)return;inbox=rows;updateBadges();renderList();}catch(error){if(root&&owner===viewer?.id&&serial===inboxRequest)status(error.message);}
}
function status(text){if($('#dm-status'))$('#dm-status').textContent=text;}
function renderList(){
 const list=$('#dm-list');if(!list)return;
 list.innerHTML=inbox.length?inbox.map(c=>`<a href="#/messages?c=${c.id}" class="dm-conversation ${c.id===activeId?'selected':''}" ${c.id===activeId?'aria-current="page"':''}>${ui.avatar(c.peer)}<span class="dm-summary"><strong>${esc(c.peer.name)}</strong><span>${c.mine?'Vous : ':''}${esc(c.preview)}</span><small>${date(c.updated)}</small></span>${c.unread?`<span class="unread-count" aria-label="${c.unread} messages non lus">${c.unread}</span>`:''}</a>`).join(''):'<p class="dm-empty-list">Vos conversations apparaîtront ici après le premier message.</p>';
 ui.loadPhotos();
}
export function unmountMessages(){epoch++;clearInterval(timer);timer=null;root=null;activeId='';messages=[];nextBefore=null;peer=null;context=null;busy=false;polling=false;}
export function mountMessages(element){
 unmountMessages();root=element;const serial=epoch;
 const params=new URLSearchParams(location.hash.split('?')[1]||'');activeId=params.get('c')||'';
 root.innerHTML=`<div class="page-heading"><div><p class="eyebrow">ENTRE NOUS</p><h1>Mes messages</h1><p>Pour s’organiser, se rendre service ou simplement échanger.</p></div><button class="btn primary" data-dm="new">${icon('plus')}Nouveau message</button></div><p id="dm-status" class="form-error" role="status"></p><div class="dm-layout ${activeId?'has-thread':''}"><aside class="dm-inbox" aria-label="Conversations"><div class="dm-inbox-heading"><h2>Conversations</h2><button class="icon-button" data-dm="refresh" aria-label="Actualiser les messages">${icon('refresh')}</button></div><div id="dm-list"></div></aside><section class="dm-thread" aria-label="Conversation" id="dm-thread">${activeId?'<p class="notice">Chargement de la conversation…</p>':`<div class="empty">${icon('chat')}<h2>Un petit mot entre voisins</h2><p>Choisissez une conversation ou contactez l’auteur d’une annonce.</p></div>`}</section></div>`;
 root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('input',onInput);
 renderList();refreshInbox();if(activeId)loadThread(true,params.get('post'));
 timer=setInterval(()=>{if(!document.hidden&&navigator.onLine&&serial===epoch){refreshInbox();if(activeId&&!busy)loadThread();}},8000);
}
function mergeRows(rows){messages=[...new Map([...messages,...rows].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq);}
function renderFeed(forceBottom=false){
 const feed=$('#dm-feed');if(!feed)return;const wasBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80,oldHeight=feed.scrollHeight,oldTop=feed.scrollTop;
 const html=messages.length?messages.map(m=>`<article class="dm-message ${m.mine?'mine':''}"><span class="sr-only">${m.mine?'Vous':esc(peer.name)} :</span>${m.post?`<button class="dm-post" data-dm="post" data-id="${m.post.id}">À propos de : ${esc(m.post.title)}</button>`:''}<p>${esc(m.body)}</p><time datetime="${new Date(m.created).toISOString()}">${date(m.created)}</time></article>`).join(''):'<p class="dm-intro">Votre premier message ne sera envoyé qu’en cliquant sur « Envoyer ».</p>';
 if(feed.innerHTML!==html){feed.innerHTML=html;feed.scrollTop=forceBottom||wasBottom?feed.scrollHeight:oldTop+(feed.scrollHeight-oldHeight);}
 const older=$('#dm-older');if(older)older.hidden=!nextBefore;
}
async function loadThread(initial=false,postId=null){
 if(polling||!root||!activeId)return;initial=initial||!$('#dm-form');if(initial&&!postId)postId=new URLSearchParams(location.hash.split('?')[1]||'').get('post');polling=true;const serial=epoch,id=activeId;
 try{
  const data=await request('conversations/'+id+(initial&&postId?'?post='+encodeURIComponent(postId):''));if(serial!==epoch)return;
  peer=data.peer;mergeRows(data.messages);if(initial)nextBefore=data.nextBefore;
  if(initial){
   context=data.context;const draft=drafts.get(id)||{text:'',key:crypto.randomUUID()};drafts.set(id,draft);
   $('#dm-thread').innerHTML=`<header class="dm-thread-heading"><a class="text-link dm-back" href="#/messages">Conversations</a><div class="dm-peer">${ui.avatar(peer)}<div><h2>${esc(peer.name)}</h2><p>Conversation privée entre vous deux</p></div></div></header><button id="dm-older" class="text-link" data-dm="older" ${nextBefore?'':'hidden'}>Messages précédents</button><div id="dm-feed" class="dm-feed" role="log" aria-label="Messages de la conversation" aria-live="polite"></div><form id="dm-form"><div id="dm-context">${context?`<span>À propos de : ${esc(context.title)}</span><button type="button" class="text-link" data-dm="clear-context">Retirer la référence</button>`:''}</div><label for="dm-body">Votre message</label><textarea id="dm-body" name="body" rows="3" maxlength="4000" placeholder="Écrivez votre message…" required>${esc(draft.text)}</textarea><div class="dm-compose-footer"><span>4 000 caractères maximum</span><button type="submit" class="btn primary">Envoyer</button></div><p id="dm-send-error" class="form-error" role="alert" tabindex="-1"></p></form><p class="dm-footnote">Les nouveaux messages apparaissent ici pendant que l’application est ouverte.</p>`;
   ui.loadPhotos();
  }
  renderFeed(initial);status('');
  if(!document.hidden&&data.messages.length){await request('conversations/'+id+'/read',{method:'POST',body:{through:data.messages.at(-1).seq}});if(serial===epoch)await refreshInbox();}
 }catch(error){if(serial===epoch)status(error.message);}finally{if(serial===epoch)polling=false;}
}
export async function openContact(input){
 const owner=viewer?.id;if(!owner){location.hash='#/connexion';return;}
 const result=await request('conversations',{method:'POST',body:input});if(owner!==viewer?.id)return;
 ui.closeModal?.();location.hash='#/messages?c='+result.id+(input.postId?'&post='+input.postId:'');
}
async function directory(){
 const serial=epoch;status('');const residents=await allPages('residents','residents');if(serial!==epoch)return;
 ui.modal('Nouveau message',`<label class="search-box"><span class="sr-only">Rechercher un habitant</span><input id="dm-resident-search" type="search" placeholder="Rechercher un habitant…"></label><div class="dm-residents">${residents.map(r=>`<button type="button" class="dm-resident" data-recipient="${esc(r.id)}" data-name="${esc(r.name)}">${ui.avatar(r)}<span>${esc(r.name)}</span>${icon('chat')}</button>`).join('')||'<p>Aucun autre habitant n’a encore créé de compte.</p>'}</div><p id="dm-directory-empty" hidden>Aucun habitant ne correspond à votre recherche.</p><p class="form-error" role="alert"></p>`);
 const dialog=document.querySelector('dialog[open]');
 dialog.querySelector('#dm-resident-search').addEventListener('input',e=>{let visible=0;for(const row of dialog.querySelectorAll('[data-recipient]')){row.hidden=!row.dataset.name.toLocaleLowerCase('fr').includes(e.target.value.toLocaleLowerCase('fr'));if(!row.hidden)visible++;}dialog.querySelector('#dm-directory-empty').hidden=!!visible;});
 dialog.querySelector('.dm-residents').addEventListener('click',async e=>{const b=e.target.closest('[data-recipient]');if(!b)return;b.disabled=true;try{await openContact({recipientId:b.dataset.recipient});}catch(error){dialog.querySelector('.form-error').textContent=error.message;b.disabled=false;}});
}
async function onClick(e){
 const b=e.target.closest('[data-dm]');if(!b)return;const action=b.dataset.dm,serial=epoch;
 try{
  if(action==='new')await directory();
  if(action==='refresh'){await refreshInbox();if(activeId)await loadThread(!$('#dm-form'));}
  if(action==='post')await ui.openPost(b.dataset.id);
  if(action==='clear-context'){context=null;$('#dm-context').replaceChildren();}
  if(action==='older'&&nextBefore){b.disabled=true;const data=await request('conversations/'+activeId+'?before='+nextBefore);if(serial!==epoch)return;mergeRows(data.messages);nextBefore=data.nextBefore;renderFeed();b.disabled=false;}
 }catch(error){if(serial===epoch){status(error.message);b.disabled=false;}}
}
function onInput(e){if(e.target.id==='dm-body')drafts.set(activeId,{text:e.target.value,key:crypto.randomUUID()});}
async function onSubmit(e){
 if(e.target.id!=='dm-form')return;e.preventDefault();if(busy)return;
 const serial=epoch,id=activeId,owner=viewer?.id,form=e.target,draft=drafts.get(id),button=form.querySelector('[type="submit"]'),error=form.querySelector('.form-error');
 if(!draft?.text.trim()){error.textContent='Écrivez un message avant de l’envoyer.';return;}
 busy=true;button.disabled=true;form.querySelector('textarea').disabled=true;error.textContent='';
 try{
  const sent=await request('conversations/'+id+'/messages',{method:'POST',body:{id:draft.key,body:draft.text,...(context?{postId:context.id}:{})}});
  if(owner===viewer?.id&&drafts.get(id)===draft)drafts.delete(id);
  if(serial!==epoch)return;mergeRows([sent.message]);$('#dm-body').value='';context=null;$('#dm-context').replaceChildren();history.replaceState(null,'','#/messages?c='+id);
  busy=false;await loadThread();renderFeed(true);await refreshInbox();$('#dm-body')?.focus();
 }catch(err){if(serial===epoch){error.textContent=err.message;error.focus();}}
 finally{if(serial===epoch){busy=false;button.disabled=false;form.querySelector('textarea').disabled=false;}}
}
setInterval(()=>{if(viewer&&!root&&!document.hidden&&navigator.onLine)refreshInbox();},15000);
