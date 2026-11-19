export const API_BASE='https://premeyzel-parcours.mathias790372.chatgpt.site';
let tokenProvider=async()=>null;
export function setTokenProvider(provider){tokenProvider=provider;}
export async function accessToken(){return tokenProvider();}
export async function request(path,options={}){
 const token=await accessToken(),headers=new Headers(options.headers||{});
 if(token)headers.set('Authorization','Bearer '+token);
 if(options.body&&typeof options.body!=='string'){headers.set('Content-Type','application/json');options={...options,body:JSON.stringify(options.body)};}
 let response;
 try{response=await fetch(API_BASE+'/api/'+path,{...options,headers,cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw new Error('Connexion impossible. Vérifiez Internet et réessayez. Votre saisie est conservée.');}
 if(options.blob){if(!response.ok)throw new Error('Photo indisponible.');return response.blob();}
 let body;try{body=await response.json();}catch{throw new Error('Le service est momentanément indisponible.');}
 if(!response.ok)throw Object.assign(new Error(body.error||'L’action n’a pas pu être enregistrée.'),{status:response.status});
 return body;
}
export async function allPages(path,key){const records=[];let offset=0;do{const page=await request(path+(path.includes('?')?'&':'?')+'offset='+offset);records.push(...page[key]);offset=page.nextOffset;}while(offset!=null);return records;}
