import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILE_BYTES, MAX_PHOTO_LENGTH, validatePhotoFile, validPhoto, photoSource } from '../photos.js';
import { CONFIG, seed, applyContentUpdates, savePost, savePostLocally } from '../model.js';
const photo='data:image/jpeg;base64,/9j/AAAA';

test('only bounded raster images and known local samples are accepted',()=>{
  for(const type of ['image/jpeg','image/png','image/webp'])assert.doesNotThrow(()=>validatePhotoFile({type,size:123}));
  for(const file of [{type:'image/svg+xml',size:100},{type:'text/html',size:100},{type:'image/jpeg',size:0},{type:'image/png',size:MAX_FILE_BYTES+1}])assert.throws(()=>validatePhotoFile(file));
  for(const value of ['https://example.com/photo.jpg','javascript:alert(1)','data:image/svg+xml;base64,AAAA','sample:unknown',{},'data:image/jpeg;base64,'+'A'.repeat(MAX_PHOTO_LENGTH)]){
    assert.equal(validPhoto(value),false);assert.equal(photoSource(value),'');
  }
  assert.equal(validPhoto(photo),true);assert.equal(photoSource(null),'');
  assert.match(decodeURIComponent(photoSource('sample:dog')),/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
});
test('photo upgrade retains each old illustration and never restores a removed/replaced photo',()=>{
  const s=seed();s.contentVersion=2;
  for(const key of ['events','trips','ads','trails'])for(const p of s[key])delete p.photo;
  const deleted=s.ads.find(p=>p.id==='a1');deleted.deleted=true;
  s.ads[0].photo=photo;s.ads[1].photo=null;
  const old=s.events.map(p=>({id:p.id,art:p.art}));
  const conversations=JSON.stringify(s.conversations);
  applyContentUpdates(s);
  for(const p of old)assert.equal(s.events.find(e=>e.id===p.id).photo,`sample:${p.art}`);
  assert.equal(s.ads[0].photo,photo);assert.equal(s.ads[1].photo,null);assert.equal(deleted.deleted,true);
  assert.equal(JSON.stringify(s.conversations),conversations);
  const snapshot=JSON.stringify(s);applyContentUpdates(s);assert.equal(JSON.stringify(s),snapshot);
});
test('photo replacement/removal respects authorship and survives serialisation',()=>{
  const s=seed(),p=s.ads.find(p=>p.id==='a4');
  assert.throws(()=>savePost(s,'lucas','ads',{...p,photo},p.id));
  savePost(s,'alice','ads',{...p,photo},p.id);assert.equal(p.photo,photo);
  savePost(s,'admin','ads',{...p,photo:null},p.id);
  assert.equal(applyContentUpdates(JSON.parse(JSON.stringify(s))).ads.find(post=>post.id===p.id).photo,null);
  assert.throws(()=>savePost(s,'alice','ads',{...p,photo:'https://example.com/a.png'},p.id));
});
test('quota failure rolls back the complete post update and notifications',()=>{
  const s=seed(),p=s.events.find(p=>p.id==='e1'),snapshot=JSON.stringify(s);
  assert.throws(()=>savePostLocally(s,'lucas','events',{...p,title:'Un nouveau titre',photo},p.id,{setItem(){throw new Error('QuotaExceededError');}}),/saisie est conservée/);
  assert.equal(JSON.stringify(s),snapshot);
  let saved;
  const next=savePostLocally(s,'lucas','events',{...p,photo},p.id,{setItem(key,value){assert.equal(key,CONFIG.storageKey);saved=value;}});
  assert.equal(JSON.stringify(s),snapshot);
  assert.deepEqual(JSON.parse(saved),next);
  assert.equal(next.events.find(e=>e.id===p.id).photo,photo);
});
