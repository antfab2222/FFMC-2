import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateFetch} from '../src/lib/private-fetch.ts';
const base='https://example.supabase.co';
const jwt=role=>`header.${Buffer.from(JSON.stringify({role,sub:'test-user'})).toString('base64url')}.signature`;
for(const token of [undefined,'sb_publishable_test',jwt('anon')]){
 test(`private requests reject missing/public credentials: ${token?.slice(0,8)}`,async()=>{
  let calls=0,lost=0;
  const send=privateFetch(base,()=>lost++,async()=>{calls++;return new Response('{}');});
  await assert.rejects(send(base+'/rest/v1/ca_mail_messages',{headers:token?{Authorization:`Bearer ${token}`}:{}}),/session/);
  assert.equal(calls,0);assert.equal(lost,1);
 });
}
test('authenticated news and mail requests retain the user token',async()=>{
 let calls=0;const token=jwt('authenticated');
 const send=privateFetch(base,()=>assert.fail('unexpected session loss'),async(_url,init)=>{
  assert.equal(new Headers(init.headers).get('Authorization'),`Bearer ${token}`);calls++;return new Response('{}');
 });
 for(const path of ['/rest/v1/ca_news_items','/functions/v1/mail-assistant'])await send(base+path,{headers:{Authorization:`Bearer ${token}`}});
 assert.equal(calls,2);
});
test('server rejection returns user to authentication, without retrying a write',async()=>{
 let calls=0,lost=0;const send=privateFetch(base,()=>lost++,async()=>{calls++;return new Response('{}',{status:401});});
 assert.equal((await send(base+'/rest/v1/records',{method:'POST',headers:{Authorization:`Bearer ${jwt('authenticated')}`}})).status,401);
 assert.equal(calls,1);assert.equal(lost,1);
});
test('login and unrelated requests are not blocked',async()=>{
 let calls=0;const send=privateFetch(base,()=>assert.fail('unexpected loss'),async()=>{calls++;return new Response('{}');});
 await send(base+'/auth/v1/otp');await send('https://other.example/rest/v1/test');assert.equal(calls,2);
});
