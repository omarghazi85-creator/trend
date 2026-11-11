import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../netlify/functions/preview-trends.mts';
const token='test-secret-is-long-enough-to-be-valid';
(globalThis as any).Netlify={env:{get:(key:string)=>key==='ATN_WORKER_SECRET'?token:undefined}};
const rows=[{country:'sa',term:'الطقس',source:'google',observedAt:'2026-11-11T05:00:00Z',score:50},{country:'sa',term:'الطقس',source:'google',observedAt:'2026-11-11T05:00:00Z',score:50}];
const endpoint='https://worker.example/.netlify/functions/preview-trends';
function req(body:unknown,authorized=true){return new Request(endpoint,{method:'POST',headers:{'content-type':'application/json',...(authorized?{'x-atn-worker-secret':token}:{})},body:JSON.stringify(body)})}
test('requires secret and makes zero network calls',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not call network')};
 try{let r=await preview(req({country:'sa',day:'2026-11-11',rows},false));assert.equal(r.status,401);r=await preview(req({country:'sa',day:'2026-11-11',rows}));assert.equal(r.status,200);const j=await r.json();assert.equal(j.termCount,1);assert.equal(j.mode,'shadow')}finally{globalThis.fetch=old}
});
test('repeat batch has same digest and no changed flag',async()=>{
 const a=await(await preview(req({country:'sa',day:'2026-11-11',rows}))).json();
 const b=await(await preview(req({country:'sa',day:'2026-11-11',rows,previousDigest:a.digest}))).json();
 assert.equal(b.changed,false);assert.equal(b.digest,a.digest);
});
test('invalid batch rejected before processing',async()=>{
 const r=await preview(req({country:'sa',day:'2026-11-11',rows:Array(201).fill(rows[0])}));assert.equal(r.status,400);
});