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

test('oversized UTF-8 preview bodies are rejected before any WordPress request even without an accurate length header',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('unexpected WordPress request');};
 try{
  for(const declared of [null,'1']){
   const headers:Record<string,string>={'content-type':'application/json','x-atn-worker-secret':config.ATN_WORKER_SECRET};
   if(declared!==null)headers['content-length']=declared;
   const tooBig=new Request(endpoint,{method:'POST',headers,
    body:JSON.stringify({candidates:[{...candidate,content:'ا'.repeat(62000)}],writeDrafts:true})});
   const result=await preview(tooBig);
   assert.equal(result.status,413);
   assert.equal((await result.json()).error,'payload_too_large');
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});

test('malformed or mismatched WordPress lookup rows never permit a draft write',async()=>{
 const original=globalThis.fetch;
 const cases=[null,{},[null],[{}],[{id:0,slug:candidate.slug,status:'draft'}],
  [{id:-1,slug:candidate.slug,status:'draft'}],
  [{id:1,slug:'different-slug',status:'publish'}],
  [{id:1,slug:candidate.slug,status:''}],
  [{id:1,slug:candidate.slug,status:9}],
  [{id:1,slug:candidate.slug,status:'draft'},{id:2,slug:candidate.slug,status:'publish'}]];
 try{
  for(const lookup of cases){
   const calls:string[]=[];
   globalThis.fetch=async(_url,opts)=>{
    calls.push(opts?.method??'GET');
    return Response.json(lookup);
   };
   const response=await preview(request());
   assert.equal(response.status,502);
   assert.equal((await response.json()).error,'wordpress_lookup_not_confirmed');
   assert.deepEqual(calls,['GET']);
  }
 }finally{globalThis.fetch=original;}
});
test('a nonpositive WordPress ID cannot confirm a newly created draft',async()=>{
 const original=globalThis.fetch;
 try{
  for(const id of [0,-1]){
   const calls:string[]=[];
   globalThis.fetch=async(_url,opts)=>{
    calls.push(opts?.method??'GET');
    return Response.json(opts?.method==='GET'?[]:{id,slug:candidate.slug,status:'draft'});
   };
   const response=await preview(request());
   assert.equal(response.status,502);
   assert.equal((await response.json()).error,'wordpress_draft_not_confirmed');
   assert.deepEqual(calls,['GET','POST']);
  }
 }finally{globalThis.fetch=original;}
});
