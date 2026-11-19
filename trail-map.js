import {createLocationTracker} from './trail-location.js';

const wmts=(layer,matrix)=>`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=${matrix}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
export function createTrailMap(container,{trails=[],selectedId,onSelect=()=>{},onOpen=null,tracking=false}={}) {
 container.classList.toggle('tracking-map',tracking);
 const L=globalThis.L;
 if(!L){container.textContent='La carte est indisponible. Vous pouvez toujours télécharger le GPX.';return {destroy(){},setTrails(){},fit(){},toggleTracking(){}};}
 const map=L.map(container,{zoomControl:false,scrollWheelZoom:false,maxZoom:18,minZoom:6}).setView([45.686,5.647],13);
 L.control.zoom({position:'topright',zoomInTitle:'Agrandir la carte',zoomOutTitle:'Réduire la carte'}).addTo(map);
 L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
 map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
 const base=L.tileLayer(wmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2','PM_0_19'),{maxNativeZoom:19,maxZoom:18,attribution:'<a href="https://cartes.gouv.fr" target="_blank" rel="noopener">© IGN · Géoplateforme</a>'}).addTo(map);
 const contours=L.tileLayer(wmts('ELEVATION.CONTOUR.LINE','PM_6_18'),{minZoom:6,maxNativeZoom:18,maxZoom:18,opacity:.72}).addTo(map);
 const status=document.createElement('div');status.className='trail-map-status';status.setAttribute('role','status');status.textContent='Plan IGN · courbes de niveau';container.append(status);
 let errors=0,loads=0;
 const tileError=()=>{if(++errors>2)status.textContent='Fond de carte indisponible. Vérifiez votre connexion Internet.';};
 base.on('tileerror',tileError);contours.on('tileerror',tileError);
 base.on('tileload',()=>{if(++loads>2 && !tracker.active)status.textContent='Plan IGN · courbes de niveau';});
 let layers=L.featureGroup().addTo(map),selected=null,marker=null,accuracy=null,follow=true,lastPosition=null;
 function fit(){if(selected?.getBounds().isValid())map.fitBounds(selected.getBounds(),{paddingTopLeft:[25,25],paddingBottomRight:[25,container.classList.contains('gpx-preview')?55:tracking?170:120],maxZoom:15});else if(layers.getBounds().isValid())map.fitBounds(layers.getBounds(),{paddingTopLeft:[25,25],paddingBottomRight:[25,container.classList.contains('gpx-preview')?55:tracking?170:120],maxZoom:15});}
 function setTrails(next,selection,fitRoute=true){
  layers.clearLayers();selected=null;
  for(const trail of next){if(!trail.track?.segments?.length)continue;const active=trail.id===selection;
   const line=L.polyline(trail.track.segments,{color:active?'#9d3f28':'#426e58',weight:active?5:3,opacity:active?1:.6}).addTo(layers);
   line.on('click',()=>onOpen?onOpen(trail.id):onSelect(trail.id));
   if(active){selected=line;const first=trail.track.segments[0][0],last=trail.track.segments.at(-1).at(-1);
    L.circleMarker(first,{radius:6,color:'#fff',weight:2,fillColor:'#284f3c',fillOpacity:1}).bindTooltip('Départ').addTo(layers);
    L.circleMarker(last,{radius:6,color:'#fff',weight:2,fillColor:'#9d3f28',fillOpacity:1}).bindTooltip('Arrivée').addTo(layers);
    for(const w of trail.track.waypoints||[]){const label=document.createElement('span');label.textContent=w.name;L.circleMarker(w.point,{radius:4,color:'#806b32'}).bindTooltip(label).addTo(layers);}
   }
  }
  if(fitRoute)fit();
 }
 const locate=document.createElement('button');locate.className='btn secondary';locate.type='button';locate.textContent='Ma position';locate.setAttribute('aria-pressed','false');
 const centre=document.createElement('button');centre.className='btn secondary';centre.type='button';centre.textContent='Recentrer sur le tracé';centre.onclick=fit;
 const followButton=document.createElement('button');followButton.className='btn secondary';followButton.type='button';followButton.textContent='Suivre ma position';followButton.hidden=true;followButton.setAttribute('aria-pressed','true');followButton.onclick=()=>{follow=!follow;followButton.setAttribute('aria-pressed',String(follow));if(follow&&lastPosition)map.panTo([lastPosition.lat,lastPosition.lon]);};
 const toolbar=document.createElement('div');toolbar.className='trail-map-toolbar';toolbar.append(centre);if(tracking)toolbar.append(locate,followButton);container.append(toolbar);
 L.DomEvent.disableClickPropagation(toolbar);L.DomEvent.disableScrollPropagation(toolbar);L.DomEvent.disableClickPropagation(status);
 const tracker=createLocationTracker({onPosition:p=>{lastPosition=p;const latLng=[p.lat,p.lon];if(!marker){marker=L.circleMarker(latLng,{radius:7,color:'#fff',weight:3,fillColor:'#266cbd',fillOpacity:1}).addTo(map);accuracy=L.circle(latLng,{radius:p.accuracy,color:'#266cbd',weight:1,fillOpacity:.10}).addTo(map);}else{marker.setLatLng(latLng);accuracy.setLatLng(latLng).setRadius(p.accuracy);marker.setStyle({fillColor:'#266cbd'});}if(follow)map.panTo(latLng);},onStatus:s=>{status.textContent=s.message;locate.textContent=s.active?'Arrêter le suivi':'Ma position';locate.setAttribute('aria-pressed',String(s.active));followButton.hidden=!s.active;if(s.stale||!s.active)marker?.setStyle({fillColor:'#777'});}});
 locate.onclick=()=>{if(tracker.active)tracker.stop();else{follow=true;followButton.setAttribute('aria-pressed','true');tracker.start();}};
 map.on('dragstart',()=>{follow=false;followButton.setAttribute('aria-pressed','false');});
 const staleTimer=setInterval(()=>tracker.checkStale(),10000);
 const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe(container);
 setTrails(trails,selectedId);
 return {setTrails,fit,toggleTracking:()=>locate.click(),destroy(){tracker.stop();clearInterval(staleTimer);observer.disconnect();map.remove();}};
}
