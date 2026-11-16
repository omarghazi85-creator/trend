import test from 'node:test';
import assert from 'node:assert/strict';
import archive from '../netlify/functions/archive.mts';

const upstream='https://arabiatrend.com/wp-json/atn-light/v1/archive?limit=100&page=1';
const valid={scope:'latest_archived_pages_only',total_in_window:2,items:[
 {title:'كلمات البحث الرائجة في المغرب يوم 2026-11-16',link:'https://arabiatrend.com/trend-archive/ma-search-2026-11-16',country:'المغرب',kind:'search',date:'2026-11-16',date_iso:'2026-11-16T10:00:00+00:00'},
 {title:'سجل رواج تجريبي',link:'https://malicious.example.net/trend-archive/evil',country:'',kind:'topic',date:'2026-11-16',date_iso:'2026-11-16T10:00:00+00:00'}
]};
test('archive proxy uses exactly one bounded WordPress GET and returns validated records',async()=>{
 const original=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(String(input));assert.equal(init?.method,'GET');return Response.json(valid);};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].country,'المغرب');
  assert.equal(body.available_in_window,2);
  assert.deepEqual(calls,[upstream]);
 }finally{globalThis.fetch=original;}
});
test('archive proxy cannot write to WordPress',async()=>{
 const response=await archive(new Request('https://preview.example/.netlify/functions/archive',{method:'POST'}));
 assert.equal(response.status,405);
});
test('malformed upstream response fails closed without exposing data',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({status:'unexpected',items:[{title:'private'}]});
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,503);
  const body=await response.json();
  assert.deepEqual(body.items,[]);
 }finally{globalThis.fetch=original;}
});
