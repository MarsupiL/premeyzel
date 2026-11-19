import {createClient} from '@supabase/supabase-js';
import {API_BASE,setTokenProvider,request} from './api-client.js';
let client=null,configuration=null,recovery=null;
const RECOVERY_KEY='premeyzel-password-recovery-v1';
function rememberRecovery(value){recovery=value;try{if(value)sessionStorage.setItem(RECOVERY_KEY,JSON.stringify(value));else sessionStorage.removeItem(RECOVERY_KEY);}catch{}}
function recoveryFor(session){return !!session?.user?.id&&recovery?.id===session.user.id&&recovery.expires>Date.now();}
export function isPasswordRecovery(){return !!recovery&&recovery.expires>Date.now();}
export function authErrorMessage(error){
 const messages={invalid_credentials:'Adresse e-mail ou mot de passe incorrect.',email_not_confirmed:'Confirmez votre adresse e-mail avant de vous connecter. Vous pouvez demander un nouveau lien ci-dessous.',user_already_exists:'Un compte existe peut-être déjà. Essayez de vous connecter ou de réinitialiser votre mot de passe.',weak_password:'Choisissez un mot de passe plus long et difficile à deviner.',same_password:'Choisissez un mot de passe différent du précédent.',over_email_send_rate_limit:'Trop de demandes d’e-mail. Patientez quelques minutes avant de réessayer.',over_request_rate_limit:'Trop de tentatives. Patientez quelques minutes avant de réessayer.',email_address_invalid:'Vérifiez votre adresse e-mail.',email_address_not_authorized:'L’envoi des e-mails de connexion est en cours de préparation. Utilisez Google pour le moment.',signup_disabled:'Les inscriptions par e-mail ne sont pas encore ouvertes.',email_provider_disabled:'La connexion par e-mail est momentanément indisponible.',otp_expired:'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.',flow_state_expired:'Ce lien a expiré. Demandez un nouveau lien depuis ce navigateur.',flow_state_not_found:'Ouvrez ce lien dans le navigateur où vous l’avez demandé, ou demandez un nouveau lien.',validation_failed:'Vérifiez les informations saisies.'};
 return messages[error?.code]||(error?.status===429?messages.over_request_rate_limit:error?.name==='AuthRetryableFetchError'?'Connexion impossible. Vérifiez Internet et réessayez.':'La demande n’a pas abouti. Réessayez dans un instant.');
}
function authClient(){if(!client||!configuration?.accountsEnabled)throw new Error('Le service de connexion est indisponible.');return client.auth;}
function redirectURL(recover=false){const url=new URL(location.href);url.hash='';url.search=recover?'?auth=recovery':'';return url.href;}
async function checked(promise){const {data,error}=await promise;if(error)throw new Error(authErrorMessage(error));return data;}
export async function initializeAuth(onChange){
 const response=await fetch(API_BASE+'/api/auth/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Le service de connexion est indisponible.');
 configuration=await response.json();
 const returned=new URL(location.href),callback=returned.searchParams.has('code'),recoveryLink=returned.searchParams.get('auth')==='recovery';
 let failure=null;
 if(configuration.configured){
  client=createClient(configuration.supabaseUrl,configuration.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'premeyzel-account-v1'}});
  try{recovery=JSON.parse(sessionStorage.getItem(RECOVERY_KEY)||'null');}catch{recovery=null;}
  // Register before initialization: the SDK can emit recovery while exchanging the callback code.
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY'){
    rememberRecovery({id:session?.user?.id,expires:Date.now()+3600000});
    location.hash='#/connexion?mode=reset';
   }else if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&recovery&&!recoveryFor(session)))rememberRecovery(null);
   if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED','TOKEN_REFRESHED','PASSWORD_RECOVERY'].includes(event))setTimeout(()=>onChange(event),0);
  });
  setTokenProvider(async()=>{const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?.access_token||null;});
  const initialized=await client.auth.initialize();
  if(initialized.error)failure=new Error(recoveryLink?'Ce lien n’est plus utilisable ici. Demandez un nouveau lien depuis ce navigateur.':'La connexion n’a pas abouti. Réessayez depuis cette page.');
  const {data}=await client.auth.getSession();if(recovery&&!recoveryFor(data.session))rememberRecovery(null);
 }
 // Remove single-use credentials and errors, including after a failed exchange.
 if(callback||returned.searchParams.has('error')||recoveryLink){
  const url=new URL(location.href);for(const key of ['code','error','error_code','error_description','auth'])url.searchParams.delete(key);
  url.hash=recoveryLink||isPasswordRecovery()?'#/connexion?mode=reset':failure||returned.searchParams.has('error')?'#/connexion':'#/compte';
  history.replaceState(null,'',url.pathname+url.search+url.hash);
  if(returned.searchParams.has('error'))failure=new Error(recoveryLink?'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.':'La connexion a été annulée ou refusée. Réessayez.');
 }
 if(failure)throw failure;
 return configuration;
}
export function authConfig(){return configuration;}
export async function signIn(provider){
 if(provider!=='google'||!client||!configuration.providers.google)throw new Error('Ce mode de connexion n’est pas disponible.');
 await checked(authClient().signInWithOAuth({provider,options:{redirectTo:redirectURL(),queryParams:{prompt:'select_account'}}}));
}
export async function signInWithEmail(email,password){return checked(authClient().signInWithPassword({email:email.trim(),password}));}
function requireEmailDelivery(){if(!configuration?.emailDeliveryEnabled)throw new Error('Les inscriptions et les e-mails de récupération seront disponibles prochainement. Vous pouvez utiliser Google.');}
function checkPassword(password){if(typeof password!=='string'||password.length<10)throw new Error('Utilisez au moins 10 caractères pour votre mot de passe.');}
export async function registerWithEmail(name,email,password){
 requireEmailDelivery();checkPassword(password);name=name.trim();if(!name||name.length>80)throw new Error('Indiquez un nom de 1 à 80 caractères.');
 return checked(authClient().signUp({email:email.trim(),password,options:{data:{full_name:name},emailRedirectTo:redirectURL()}}));
}
export async function requestPasswordReset(email){requireEmailDelivery();return checked(authClient().resetPasswordForEmail(email.trim(),{redirectTo:redirectURL(true)}));}
export async function resendConfirmation(email){requireEmailDelivery();return checked(authClient().resend({type:'signup',email:email.trim(),options:{emailRedirectTo:redirectURL()}}));}
export async function updateRecoveredPassword(password){
 checkPassword(password);const auth=authClient(),{data,error}=await auth.getSession();
 if(error||!recoveryFor(data.session)){rememberRecovery(null);throw new Error('Demandez un nouveau lien pour réinitialiser votre mot de passe.');}
 await checked(auth.updateUser({password}));rememberRecovery(null);
}
export async function signOut(){if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}rememberRecovery(null);}
export async function currentAccount(){const {user}=await request('me');return user;}
