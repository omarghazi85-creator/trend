import test from 'node:test';
import assert from 'node:assert/strict';
import preview from '../netlify/functions/preview-sync.mts';

const config:Record<string,string>={
 ATN_WORKER_SECRET:'test-secret-is-long-enough-to-be-valid',
 WP_WRITE_ENABLED:'true',WP_USERNAME:'editor',WP_APPLICATION_PASSWORD:'test-app-password'
};
(globalThis as any).Netlify={env:{get:(name:string)=>config[name]}};
const candidate={
 title:'خبر تقني مؤكد ومراجع تحريرياً',
 slug:'trusted-technology-news-2026-11-21',
 content:'<p>'+'مادة عربية تحريرية مكتملة '.repeat(12)+'</p>'
};
const endpoint='https://worker.example/.netlify/functions/preview-sync';
const request=(items:unknown[]= [candidate],writeDrafts=true)=>
 new Request(endpoint,{method:'POST',headers:{'content-type':'application/json',
 'x-atn-worker-secret':config.ATN_WORKER_SECRET},
 body:JSON.stringify({candidates:items,writeDrafts})});

test('an existing authorized WordPress draft is detected before a second write',async()=>{
 const prev=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(url,opts)=>{
  calls.push((opts?.method??'GET')+' '+String(url));
  assert.equal(opts?.method,'GET','must not create a duplicate');
  const params=new URL(String(url)).searchParams;
  assert.equal(params.get('status'),'any');
  assert.equal(params.get('slug'),candidate.slug);
  return Response.json([{id:998,slug:candidate.slug,status:'draft'}]);
 };
 try{
  const response=await preview(request());
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.results[0].action,'skip_existing');
  assert.equal(calls.length,1);
 }finally{globalThis.fetch=prev;}
});
test('a new item can only be reported successful after WordPress confirms an exact draft',async()=>{
 const prev=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=async(url,opts)=>{
  calls.push(opts?.method??'GET');
  if(opts?.method==='GET')return Response.json([]);
  assert.equal(opts?.method,'POST');
  assert.equal(JSON.parse(String(opts?.body)).status,'draft');
  return Response.json({id:991,slug:candidate.slug,status:'draft'});
 };
 try{
  const response=await preview(request());
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.results[0].action,'created_draft');
  assert.deepEqual(calls,['GET','POST']);
 }finally{globalThis.fetch=prev;}
});
test('unexpected WordPress publication or altered slug is never labeled created_draft',async()=>{
 const prev=globalThis.fetch;
 globalThis.fetch=async(_url,opts)=>opts?.method==='GET'?Response.json([]):Response.json({id:991,slug:candidate.slug,status:'publish'});
 try{
  const response=await preview(request());
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'wordpress_draft_not_confirmed');
 }finally{globalThis.fetch=prev;}
});
test('blocked editorial candidates cause zero WordPress network calls',async()=>{
 const prev=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('must not contact WordPress');};
 try{
  const response=await preview(request([{...candidate,title:'p&#111;rn news'}]));
  assert.equal(response.status,400);
  assert.equal(calls,0);
 }finally{globalThis.fetch=prev;}
});
