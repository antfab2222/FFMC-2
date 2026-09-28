import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {decryptToken} from '../gmail-connect/crypto.ts';
import {normalizeMessage,categories,topics} from './content.ts';
import {analyzeMail,GeminiError} from './gemini.ts';
const CLIENT_ID='533703714987-tmhpt6kpfg1qa2a9ggav54lo1rv5st7r.apps.googleusercontent.com';
const ORIGIN='https://antfab2222.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
class SafeError extends Error{constructor(message:string,public status=400){super(message);}}
const check=(r:any)=>{if(r.error)throw new SafeError('Enregistrement indisponible. Réessayez.',500);return r.data;};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Méthode non autorisée.'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'Origine non autorisée.'},403);
 const projectUrl=Deno.env.get('SUPABASE_URL')!;
 const db=createClient(projectUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const lockOwner=crypto.randomUUID();let locked=false;let scheduled=false;let action='';
 try{
  let input;try{input=await req.json();}catch{return json({error:'Requête invalide.'},400);}
  action=input?.action;
  const jobToken=req.headers.get('x-mail-job-token');
  if(jobToken){
   if(!/^[a-f0-9]{64}$/.test(jobToken)||!['sync','analyze'].includes(action))return json({error:'Tâche non autorisée.'},401);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jobToken))),x=>x.toString(16).padStart(2,'0')).join('');
   const claim=check(await db.from('ca_mail_job_tokens').delete().eq('token_hash',hash).eq('action',action).gt('expires_at',new Date().toISOString()).select('action').maybeSingle());
   if(!claim)return json({error:'Tâche expirée ou déjà exécutée.'},401);
   const owner=check(await db.from('ca_gmail_connections').select('connected_by,auto_enabled,ai_pause_until').eq('id','primary').maybeSingle());
   if(!owner?.auto_enabled)return json({skipped:'Automatisation désactivée.'});
   const member=check(await db.from('ca_members').select('user_id').eq('user_id',owner.connected_by).eq('role','coordinateur').maybeSingle());
   if(!member)return json({error:'Coordinateur non autorisé.'},403);
   if(action==='analyze'&&owner.ai_pause_until&&Date.parse(owner.ai_pause_until)>Date.now())return json({skipped:'Analyse automatique en pause.'});
   scheduled=true;
  }else{
   const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return json({error:'Connexion requise.'},401);
   const {data:{user},error}=await db.auth.getUser(auth.slice(7));if(error||!user)return json({error:'Session expirée.'},401);
   const member=check(await db.from('ca_members').select('user_id').eq('user_id',user.id).eq('role','coordinateur').maybeSingle());if(!member)return json({error:'Réservé au coordinateur.'},403);
  }
  if(action==='file'){
   if(typeof input.id!=='string'||!/^[a-f0-9]+$/i.test(input.id)||!categories.includes(input.category)||!topics.includes(input.topic))throw new SafeError('Classement invalide.');
   const saved=check(await db.from('ca_mail_messages').update({mail_category:input.category,mail_topic:input.topic,filing_source:'manual'}).eq('id',input.id).select('id').maybeSingle());
   if(!saved)throw new SafeError('Mail introuvable.',404);
   return json({saved:true});
  }
  if(action==='schedule'){
   if(typeof input.enabled!=='boolean')throw new SafeError('Réglage invalide.');
   check(await db.from('ca_gmail_connections').update({auto_enabled:input.enabled}).eq('id','primary'));
   return json({enabled:input.enabled});
  }
  const apiKey=Deno.env.get('GEMINI_API_KEY')?.trim();
  const aiEnabled=Boolean(apiKey)&&Deno.env.get('MAIL_AI_ENABLED')==='true';
  const day=new Date().toISOString().slice(0,10);const dailyLimit=20;
  if(input.action==='status'){
   const usage=check(await db.from('ca_mail_ai_usage').select('attempts').eq('day',day).maybeSingle());
   const pending=await db.from('ca_mail_messages').select('id',{count:'exact',head:true}).is('analysis',null);check(pending);
   const connection=check(await db.from('ca_gmail_connections').select('last_sync,sync_page_token,auto_enabled,auto_last_run,ai_pause_until,ai_error,sync_error').eq('id','primary').maybeSingle());
   return json({autoEnabled:connection?.auto_enabled||false,autoLastRun:connection?.auto_last_run,aiPauseUntil:connection?.ai_pause_until,aiError:connection?.ai_error,syncError:connection?.sync_error,aiEnabled,aiConfigured:Boolean(apiKey),pending:pending.count,remainingToday:Math.max(0,dailyLimit-(usage?.attempts||0)),lastSync:connection?.last_sync,hasMore:Boolean(connection?.sync_page_token)});
  }
  if(!['sync','analyze'].includes(input.action))throw new SafeError('Action inconnue.');
  if(scheduled&&action==='analyze'&&!aiEnabled)return json({skipped:'IA désactivée.'});
  if(input.action==='analyze'&&!aiEnabled)throw new SafeError('L’IA attend GEMINI_API_KEY et MAIL_AI_ENABLED=true dans les secrets Supabase.',503);
  const connection=check(await db.from('ca_gmail_connections').update({lock_until:new Date(Date.now()+150000).toISOString(),lock_owner:lockOwner}).eq('id','primary').lt('lock_until',new Date().toISOString()).select('*').maybeSingle());
  if(!connection)throw new SafeError('Connectez Gmail ou attendez la fin du traitement déjà lancé.',409);locked=true;
  if(scheduled)check(await db.from('ca_gmail_connections').update({auto_last_run:new Date().toISOString()}).eq('id','primary'));
  if(input.action==='sync'){
   const secret=Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();if(!secret)throw new SafeError('Secret Google manquant.',503);
   let refreshToken;try{refreshToken=await decryptToken(connection.refresh_token_encrypted,secret,projectUrl);}catch{throw new SafeError('Reconnectez Gmail : la clé de connexion a changé.',409);}
   const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:secret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
   if(!tokenResponse.ok)throw new SafeError('Autorisation Google expirée ou refusée. Reconnectez Gmail.',409);
   const token=await tokenResponse.json();if(!token.access_token)throw new SafeError('Google n’a pas fourni d’accès.',502);
   async function gmail(path:string){const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(12000)});if(r.status===404)return null;if(!r.ok)throw new SafeError('Lecture Gmail interrompue. Réessayez ; les mails déjà importés sont conservés.',502);return await r.json();}
   const profile=await gmail('profile');if(profile?.emailAddress?.toLowerCase()!=='coordinateur.ffmc06@gmail.com')throw new SafeError('Boîte Gmail inattendue.',403);
   const started=connection.sync_started||Math.floor(Date.now()/1000);
   const since=connection.sync_since||started-30*86400;
   const query=new URLSearchParams({q:`after:${since} before:${started+1} -in:chats -in:drafts`,maxResults:'50',includeSpamTrash:'false'});
   if(connection.sync_page_token)query.set('pageToken',connection.sync_page_token);
   const listing=await gmail('messages?'+query);if(!listing)throw new SafeError('Liste Gmail indisponible.',502);
   const messages=listing.messages||[];let imported=0;
   for(let i=0;i<messages.length;i+=10){const chunk=await Promise.all(messages.slice(i,i+10).map(async(m:any)=>{if(!/^[a-f\d]+$/i.test(m.id))throw new SafeError('Réponse Gmail invalide.',502);return gmail('messages/'+m.id+'?format=full');}));const rows=chunk.filter(Boolean).map(normalizeMessage);if(rows.length){const saved=check(await db.from('ca_mail_messages').upsert(rows,{onConflict:'id',ignoreDuplicates:true}).select('id'));imported+=saved.length;}}
   const hasMore=Boolean(listing.nextPageToken);
   check(await db.from('ca_gmail_connections').update({sync_error:null,sync_page_token:listing.nextPageToken||null,sync_started:hasMore?started:null,sync_since:hasMore?since:started-86400,last_sync:new Date().toISOString()}).eq('id','primary').eq('lock_owner',lockOwner));
   return json({imported,hasMore,aiEnabled});
  }
  const usage=check(await db.from('ca_mail_ai_usage').select('attempts').eq('day',day).maybeSingle());let attempts=usage?.attempts||0;
  if(attempts>=dailyLimit)throw new SafeError('Limite de 20 analyses atteinte aujourd’hui. Reprenez demain.',429);
  const messages=check(await db.from('ca_mail_messages').select('*').is('analysis',null).order('sent_at',{ascending:false}).limit(Math.min(3,dailyLimit-attempts)));
  let analyzed=0;
  for(const m of messages){
   const history=check(await db.from('ca_mail_messages').select('subject,sender,sent_at,direction,body').eq('thread_id',m.thread_id).lt('sent_at',m.sent_at).order('sent_at',{ascending:false}).limit(2));
   const context=history.reverse().map((x:any)=>({...x,body:x.body.slice(0,2000)}));
   check(await db.from('ca_mail_ai_usage').upsert({day,attempts:++attempts}));
   const analysis=await analyzeMail(apiKey!,{today:day,message:{subject:m.subject,sender:m.sender,date:m.sent_at,direction:m.direction,body:m.body.slice(0,12000),truncated:m.truncated||m.body.length>12000},previous:context,attachments_read:false});
   check(await db.from('ca_mail_messages').update({analysis,analyzed_at:new Date().toISOString(),reviewed_at:new Date().toISOString(),review_source:'gemini'}).eq('id',m.id).is('analysis',null));analyzed++;
  }
  check(await db.from('ca_gmail_connections').update({ai_error:null,ai_pause_until:null}).eq('id','primary'));
  return json({analyzed,remainingToday:dailyLimit-attempts});
 }catch(e){
  if(locked&&e instanceof GeminiError)await db.from('ca_gmail_connections').update({ai_error:e.message,ai_pause_until:new Date(Date.now()+e.pauseMs).toISOString()}).eq('id','primary');
  if(locked&&action==='sync')await db.from('ca_gmail_connections').update({sync_error:e instanceof SafeError?e.message:'Import interrompu.'}).eq('id','primary');
  return json({error:e instanceof SafeError||e instanceof GeminiError?e.message:'Traitement interrompu. Réessayez ; les résultats enregistrés sont conservés.'},e instanceof SafeError?e.status:500);}
 finally{if(locked)await db.from('ca_gmail_connections').update({lock_until:new Date(0).toISOString(),lock_owner:null}).eq('id','primary').eq('lock_owner',lockOwner);}
});
