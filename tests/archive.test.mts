import test from 'node:test';
import assert from 'node:assert/strict';
import archive from '../netlify/functions/archive.mts';
const upstream='https://public-api.wordpress.com/rest/v1.1/sites/250183068/posts/?type=page&number=100&offset=0';
const payload={found:982,posts:[
 {ID:86289,title:'كلمات البحث الرائجة في المغرب يوم 2026-11-16',URL:'https://arabiatrend.com/trend-archive/ma-search-2026-11-16',slug:'ma-search-2026-11-16',status:'publish',parent:{ID:61269},date:'2026-11-16T14:10:53+00:00'},
 {ID:86291,title:'حصيلة ترندات المغرب',URL:'https://arabiatrend.com/trend-archive/ma-week-2026-11-09',slug:'ma-week-2026-11-09',status:'publish',parent:{ID:61269},date:'2026-11-16T14:10:55+00:00'},
 {ID:999,title:'Unrelated',URL:'https://arabiatrend.com/test',slug:'test',status:'publish',parent:false,date:'2026-11-16T00:00:00+00:00'},
 {ID:991,title:'Spoofed',URL:'https://malicious.example.net/trend-archive/ma-search-2026-11-16',slug:'ma-search-2026-11-16',status:'publish',parent:{ID:61269},date:'2026-11-16T00:00:00+00:00'}
]};
test('uses official public WordPress.com API, one GET, exact archive parent, safe URLs and country codes',async()=>{
 const original=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(String(input));assert.equal(init?.method,'GET');return Response.json(payload);};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.items.length,2);
  assert.equal(body.items[0].country,'المغرب');
  assert.equal(body.items[0].kind,'search');
  assert.equal(body.items[1].kind,'weekly');
  assert.equal(body.available_in_window,2);
  assert.deepEqual(calls,[upstream]);
 }finally{globalThis.fetch=original;}
});
test('proxy rejects write methods',async()=>{
 const response=await archive(new Request('https://preview.example/.netlify/functions/archive',{method:'POST'}));
 assert.equal(response.status,405);
});
test('invalid upstream schema fails closed',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({unexpected:'data'});
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,503);
  assert.deepEqual((await response.json()).items,[]);
 }finally{globalThis.fetch=original;}
});
