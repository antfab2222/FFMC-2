/** Never let private requests silently fall back to the public API key. */
export function privateFetch(baseUrl:string, onSessionLost:()=>void, send:typeof fetch=fetch):typeof fetch {
 const origin=new URL(baseUrl).origin;
 return async (input,init)=>{
  const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const privateRequest=target.origin===origin&&(/^\/rest\/v1\//.test(target.pathname)||/^\/functions\/v1\//.test(target.pathname));
  if(!privateRequest)return send(input,init);
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  // The SDK has already resolved/refreshed the session before calling this fetch.
  const bearer=headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  let authenticated=false;
  try{
   const payload=JSON.parse(atob(bearer!.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   authenticated=payload.role==='authenticated'&&Boolean(payload.sub);
  }catch{/* A public key or absent token is not a user session. */}
  if(!authenticated){onSessionLost();throw new Error('Votre session a expiré. Reconnectez-vous pour charger les mails et les actualités.');}
  // This local check only prevents anonymous requests; the server still validates the JWT and RLS.
  const response=await send(input,init);
  if(response.status===401)onSessionLost();
  return response;
 };
}
