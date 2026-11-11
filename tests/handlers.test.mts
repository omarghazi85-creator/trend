import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../netlify/functions/preview-sync.mts';
import health from '../netlify/functions/health.mts';
const secret='example-secret-for-local-unit-testing-only';
const candidate={title:'خبر تقني كامل ومدقق للنشر',slug:'example-article-2026',content:'نص عربي أصلي تم مراجعته تحريرياً '.repeat(9)};
function makeRequest(body:object,authorized=true):Request {
 return new Request('https://worker.example/.netlify/functions/preview-sync',{method:'POST',headers:{'content-type':'application/json',...(authorized?{'x-atn-worker-secret':secret}:{})},body:JSON.stringify(body)});
}
test('health never requests WordPress',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('should_not_fetch')};try{const r=await health(new Request('https://worker.example/.netlify/functions/health'));const j=await r.json();assert.equal(r.status,200);assert.equal(j.mode,'idle')}finally{globalThis.fetch=old}});
test('unauthenticated requests are rejected before WordPress access',async()=>{globalThis.Netlify={env:{get:(key:string)=>key==='ATN_WORKER_SECRET'?secret:undefined}};const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('should_not_fetch')};try{const r=await preview(makeRequest({candidates:[candidate]},false));assert.equal(r.status,401)}finally{globalThis.fetch=old}});
test('dry run detects existing slug and performs zero writes',async()=>{globalThis.Netlify={env:{get:(key:string)=>key==='ATN_WORKER_SECRET'?secret:undefined}};const old=globalThis.fetch;let count=0;globalThis.fetch=async(_url:unknown,opts:RequestInit)=>{count++;assert.equal(opts.method,'GET');return Response.json([{id:123,slug:candidate.slug,status:'publish'}])};try{const r=await preview(makeRequest({candidates:[candidate],writeDrafts:false}));const j=await r.json();assert.equal(r.status,200);assert.equal(j.results[0].action,'skip_existing');assert.equal(count,1)}finally{globalThis.fetch=old}});
test('draft writes are disabled without explicit environment gate',async()=>{globalThis.Netlify={env:{get:(key:string)=>key==='ATN_WORKER_SECRET'?secret:undefined}};const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('should_not_fetch')};try{const r=await preview(makeRequest({candidates:[candidate],writeDrafts:true}));assert.equal(r.status,403)}finally{globalThis.fetch=old}});
