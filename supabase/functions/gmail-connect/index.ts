import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { randomState, hash, encryptToken } from './crypto.ts';

const CLIENT_ID = '533703714987-tmhpt6kpfg1qa2a9ggav54lo1rv5st7r.apps.googleusercontent.com';
const MAILBOX = 'coordinateur.ffmc06@gmail.com';
const SITE = 'https://antfab2222.github.io/FFMC/';
const ORIGIN = new URL(SITE).origin;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const headers = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{...headers,'Content-Type':'application/json'}});
const redirect = (status: string) => new Response(null,{status:303,headers:{...headers,Location:`${SITE}?gmail=${encodeURIComponent(status)}`}});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (!['POST','GET'].includes(req.method)) return json({error:'Méthode non autorisée.'},405);
  if (req.method === 'POST' && req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return json({error:'Origine non autorisée.'},403);
  const projectUrl = Deno.env.get('SUPABASE_URL')!;
  const secret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  const db = createClient(projectUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  async function isCoordinator(userId: string) {
    const {data,error} = await db.from('ca_members').select('user_id').eq('user_id',userId).eq('role','coordinateur').maybeSingle();
    if (error) throw new Error('Database unavailable');
    return Boolean(data);
  }
  try {
    if (req.method === 'GET') {
      // Google cannot send a Supabase JWT: authenticate this callback with a
      // random, expiring, single-use state created by a verified coordinator.
      const url = new URL(req.url);
      const state = url.searchParams.get('state');
      if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return json({error:'Connexion invalide. Recommencez depuis le site.'},400);
      const {data:pending,error} = await db.from('ca_gmail_oauth_states').delete().eq('state_hash',await hash(state)).gt('expires_at',new Date().toISOString()).select('user_id').maybeSingle();
      if (error) throw error;
      if (!pending || !await isCoordinator(pending.user_id)) return json({error:'Connexion expirée ou non autorisée. Recommencez depuis le site.'},400);
      if (url.searchParams.has('error')) return redirect('cancelled');
      const code = url.searchParams.get('code');
      if (!secret || !code || code.length > 4096) return redirect('not-configured');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:CLIENT_ID,client_secret:secret,code,grant_type:'authorization_code',redirect_uri:`${projectUrl}/functions/v1/gmail-connect`}),signal:AbortSignal.timeout(15000)
      });
      if (!tokenResponse.ok) return redirect('failed');
      const token = await tokenResponse.json();
      if (!token.access_token || !token.refresh_token || !String(token.scope || '').split(' ').includes(SCOPE)) return redirect('consent-required');
      const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{
        headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000)
      });
      if (!profileResponse.ok) return redirect('failed');
      const profile = await profileResponse.json();
      if (String(profile.emailAddress).toLowerCase() !== MAILBOX) return redirect('wrong-account');
      // Recheck the role after Google requests; never store tokens for a revoked coordinator.
      if (!await isCoordinator(pending.user_id)) return redirect('failed');
      const {error:saveError} = await db.from('ca_gmail_connections').upsert({id:'primary',mailbox:MAILBOX,refresh_token_encrypted:await encryptToken(token.refresh_token,secret,projectUrl),connected_by:pending.user_id,connected_at:new Date().toISOString()});
      if (saveError) throw saveError;
      return redirect('connected');
    }
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return json({error:'Connexion au site requise.'},401);
    const {data:{user},error:authError} = await db.auth.getUser(auth.slice(7));
    if (authError || !user) return json({error:'Session expirée. Reconnectez-vous.'},401);
    if (!await isCoordinator(user.id)) return json({error:'Accès réservé au coordinateur.'},403);
    let input;
    try { input = await req.json(); } catch { return json({error:'Requête invalide.'},400); }
    if (input.action === 'status') {
      const {data,error} = await db.from('ca_gmail_connections').select('mailbox,connected_at').eq('id','primary').maybeSingle();
      if (error) throw error;
      return json({configured:Boolean(secret),mailbox:MAILBOX,connected:Boolean(data),connectedAt:data?.connected_at || null});
    }
    if (input.action !== 'start') return json({error:'Action inconnue.'},400);
    if (!secret) return json({error:'Ajoutez GOOGLE_CLIENT_SECRET dans les secrets des fonctions Supabase.'},503);
    const state = randomState();
    const {error} = await db.from('ca_gmail_oauth_states').upsert({user_id:user.id,state_hash:await hash(state),expires_at:new Date(Date.now()+10*60*1000).toISOString()});
    if (error) throw error;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({client_id:CLIENT_ID,redirect_uri:`${projectUrl}/functions/v1/gmail-connect`,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent select_account',login_hint:MAILBOX,state}).toString();
    return json({url:url.href});
  } catch {
    // Never log provider responses, auth codes, state, refresh tokens or secrets.
    return req.method === 'GET' ? redirect('failed') : json({error:'Connexion Gmail indisponible. Réessayez.'},500);
  }
});
