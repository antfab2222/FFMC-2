import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {ShieldCheck,Mail,LogOut} from 'lucide-react';
import {configured,supabase,SESSION_LOST_EVENT} from './lib/backend';
import Dashboard from './Dashboard';
import SharedMail from './SharedMail';
import './styles.css';
function App(){const [session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(configured),[member,setMember]=useState(false),[role,setRole]=useState('membre'),[preview,setPreview]=useState(false),[email,setEmail]=useState(''),[notice,setNotice]=useState(''),[sending,setSending]=useState(false),[fault,setFault]=useState(''),[retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(Date.now());
const retrySeconds=Math.max(0,Math.ceil((retryAt-clock)/1000));
useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
useEffect(()=>{if(!supabase)return;const client=supabase;let alive=true;let revision=0;async function check(s:Session|null){const checkId=++revision;setSession(s);setMember(false);setRole('membre');setChecking(true);setFault('');if(s){try{const {data,error}=await client.from('ca_members').select('user_id,role').eq('user_id',s.user.id).maybeSingle();if(!alive||checkId!==revision)return;if(error)setFault('Impossible de vérifier votre accès. Réessayez dans un instant.');else {setMember(Boolean(data));setRole(data?.role||'membre');}}catch{if(alive&&checkId===revision)setFault('Impossible de vérifier votre accès. Réessayez.');}}if(alive&&checkId===revision)setChecking(false);}
let authTimer:ReturnType<typeof setTimeout>|undefined;
function lostSession(){
 ++revision;setSession(null);setMember(false);setRole('membre');setChecking(false);
 setFault('Votre session a expiré. Reconnectez-vous pour retrouver vos mails et les actualités.');
}
async function restore(){
 try{const {data,error}=await client.auth.getSession();if(!alive)return;
 if(error||!data.session){lostSession();return;}
 await check(data.session);
 }catch{if(alive){setChecking(false);setFault('Connexion indisponible. Réessayez.');}}
}
function resume(){if(document.visibilityState==='visible')void restore();}
const {data:{subscription}}=client.auth.onAuthStateChange((_event,s)=>{
 // Wait until the Auth callback releases its lock before querying PostgREST.
 clearTimeout(authTimer);
 authTimer=setTimeout(()=>{if(alive)void check(s);},0);
});
window.addEventListener(SESSION_LOST_EVENT,lostSession);
window.addEventListener('pageshow',resume);
document.addEventListener('visibilitychange',resume);
return()=>{alive=false;++revision;clearTimeout(authTimer);subscription.unsubscribe();window.removeEventListener(SESSION_LOST_EVENT,lostSession);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);};},[]);

async function requestLink(e:React.FormEvent){e.preventDefault();if(!supabase||sending||Date.now()<retryAt)return;setSending(true);setNotice('');try{const redirectTo=new URL(import.meta.env.BASE_URL,window.location.origin).href;const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});if(error){if(error.status===429&&/email rate limit exceeded/i.test(error.message)){setRetryAt(0);setNotice('Le quota d’envoi des mails de connexion est atteint. Le serveur ne précise pas l’heure de rétablissement. Attendez avant une nouvelle demande ; si le blocage persiste, le service d’envoi doit être configuré par le coordinateur.');}else if(error.status===429){const seconds=Number(error.message.match(/after (\d+) seconds/i)?.[1]||60);setClock(Date.now());setRetryAt(Date.now()+seconds*1000);setNotice('Trop de demandes rapprochées. Attendez la fin du délai avant de réessayer. Si vous avez reçu plusieurs mails, utilisez uniquement le lien du plus récent, une seule fois.');}else setNotice('Le lien n’a pas pu être demandé. Réessayez plus tard. Si le problème persiste, contactez le coordinateur.');}else{setClock(Date.now());setRetryAt(Date.now()+60000);setNotice('Si votre compte est autorisé, vous recevrez un lien de connexion par mail. Ouvrez uniquement le mail le plus récent : le lien ne sert qu’une fois.');}}catch{setNotice('Connexion indisponible. Réessayez plus tard.');}finally{setSending(false);}}
async function logout(){const {error}=await supabase!.auth.signOut();if(error)setFault('Déconnexion impossible. Réessayez.');}
if(session&&member&&!checking)return <><div className="account-bar"><span>{session.user.email} · {role==='coordinateur'?'Coordinateur':'Membre du CA'}</span>{role==='coordinateur'&&<button onClick={()=>setPreview(!preview)}>{preview?'Revenir à la vue coordinateur':'Voir la vue membre du CA'}</button>}<button onClick={logout}><LogOut size={14}/> Se déconnecter</button>{fault&&<span role="alert">{fault}</span>}</div>{role==='coordinateur'&&!preview?<Dashboard key={session.user.id}/>:<>{preview&&<div className="preview-banner">Aperçu de la vue membre : uniquement les mails publiés au CA.</div>}<SharedMail key={session.user.id+'-ca'}/></>}</>;
return <main className="login-page"><div className="login-card"><div className="brand"><span>06</span><div>FFMC<strong>ESPACE CA</strong></div></div><ShieldCheck size={30}/><h1>{!configured?'L’espace se prépare':checking?'Vérification de votre accès…':session?'Accès au CA requis':'Bienvenue dans l’espace CA'}</h1>{!configured?<><p>La connexion des membres et la sauvegarde partagée doivent encore être activées par le coordinateur.</p><p>Les réunions, dossiers et échéances seront accessibles ici une fois cette configuration terminée.</p></>:checking?<p>Un instant, nous vérifions votre connexion.</p>:session?<><p>{fault||'Votre compte est connecté, mais n’est pas autorisé à consulter les informations du CA. Contactez le coordinateur.'}</p>{fault&&<button className="secondary" onClick={()=>location.reload()}>Réessayer</button>}<button className="secondary" onClick={logout}>Se déconnecter</button></>:<><p>Un espace réservé aux membres autorisés du conseil d’administration de la FFMC 06.</p><form onSubmit={requestLink}><label htmlFor="email">Votre adresse mail</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="prenom@exemple.fr"/><button className="primary" disabled={sending||retrySeconds>0}><Mail size={18}/>{sending?'Envoi en cours…':retrySeconds>0?`Nouvelle demande dans ${retrySeconds} s`:'Recevoir un lien de connexion'}</button></form><p className="login-help">Utilisez l’adresse associée à votre invitation. Aucun mot de passe à retenir.</p>{notice&&<p role="status" className="login-notice">{notice}</p>}{fault&&<p role="alert">{fault}</p>}</>}</div></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
