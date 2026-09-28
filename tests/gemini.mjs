import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const content=compile(readFileSync('supabase/functions/mail-assistant/content.ts','utf8'));
const {analyzeMail}=await import(compile(readFileSync('supabase/functions/mail-assistant/gemini.ts','utf8').replace("'./content.ts'",JSON.stringify(content))));
const a={category:'Correspondance',topic:'Autre',priority:'Courante',actions:['Pour information'],summary:'Résumé',reason:'Info',discussion:'',reply_draft:'',deadline:null,uncertainties:''};
const success=async(url,opts)=>{assert.match(url,/generativelanguage.googleapis.com/);assert.ok(!url.includes('fake-key'));assert.equal(opts.headers['x-goog-api-key'],'fake-key');const b=JSON.parse(opts.body);assert.equal(b.generationConfig.responseMimeType,'application/json');assert.ok(b.systemInstruction);assert.ok(!b.tools);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'ignored'},{text:JSON.stringify(a)}]}}]});};
assert.deepEqual(await analyzeMail('fake-key',{mail:'test'},success),a);
for(const code of [400,401,403,404,429,500])await assert.rejects(()=>analyzeMail('fake-key',{},async()=>new Response('SECRET PRIVATE MAIL',{status:code})),e=>!e.message.includes('SECRET')&&e.message.includes('Gemini'));
for(const result of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS'}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}])await assert.rejects(()=>analyzeMail('fake-key',{},async()=>Response.json(result)));
console.log('PASS Gemini: request authentication/schema, valid results, quota/auth/server errors, blocked/incomplete/invalid results, no provider data leakage. No real API calls.');

await assert.rejects(()=>analyzeMail('fake-key',{},async()=>new Response('',{status:402})),e=>e.pauseMs===86400000&&e.message.includes('402'));
