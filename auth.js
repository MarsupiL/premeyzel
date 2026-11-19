import {createClient} from '@supabase/supabase-js';
import {API_BASE,setTokenProvider,request} from './api-client.js';
let client=null,configuration=null;
export async function initializeAuth(onChange){
 const response=await fetch(API_BASE+'/api/auth/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Le service de connexion est indisponible.');
 configuration=await response.json();
 const returnedFromSignIn=new URL(location.href).searchParams.has('code');
 if(configuration.configured){
  client=createClient(configuration.supabaseUrl,configuration.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'premeyzel-account-v1'}});
  setTokenProvider(async()=>{const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?.access_token||null;});
  const initialized=await client.auth.initialize();
  if(initialized.error)throw new Error('La connexion n’a pas abouti. Réessayez depuis cette page.');
  client.auth.onAuthStateChange((event)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED','TOKEN_REFRESHED'].includes(event))setTimeout(onChange,0);});
 }
 // OAuth codes/errors are single-use and should not remain in browser history.
 const url=new URL(location.href);
 if(returnedFromSignIn||url.searchParams.has('code')||url.searchParams.has('error')){
  const error=url.searchParams.get('error_description');url.searchParams.delete('code');url.searchParams.delete('error');url.searchParams.delete('error_description');
  if(returnedFromSignIn)url.hash='#/compte';
  history.replaceState(null,'',url.pathname+url.search+url.hash);if(error)throw new Error('La connexion a été annulée ou refusée. Réessayez.');
 }
 return configuration;
}
export function authConfig(){return configuration;}
export async function signIn(provider){
 if(!client||!configuration.providers[provider])throw new Error('Ce mode de connexion n’est pas encore disponible.');
 const redirect=new URL(location.href);redirect.hash='';redirect.search='';
 const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:redirect.href,...(provider==='google'?{queryParams:{prompt:'select_account'}}:{})}});if(error)throw error;
}
export async function signOut(){if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}}
export async function currentAccount(){const {user}=await request('me');return user;}
