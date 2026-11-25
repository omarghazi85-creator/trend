import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEditorialText,isEditorialTrendAllowed,isEditorialSourceUrlAllowed,filterTrendObservations} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';
import archive from '../netlify/functions/archive.mts';

const countries=['sa','eg','sd','so','dj','km'];
const escaped=String.raw`p\u{6f}rnographic`;
const brand=String.raw`only\u{000066}ans`;
test('bounded Unicode scalar escapes resolve before checking explicit material or media origins',()=>{
 assert.equal(decodeEditorialText(String.raw`Weather \u{1F324}`),'Weather 🌤');
 for(const value of [escaped,brand,String.raw`p\u{110000}orn`,String.raw`p\u{D800}orn`,String.raw`p\u{6f`])
  assert.equal(isEditorialTrendAllowed(value),false,value);
 assert.equal(isEditorialTrendAllowed(String.raw`Local \u{73}ports`),true);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/ref/only%5Cu%7B66%7Dans'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/sports'),true);
});
test('six-country snapshots reject braced escapes before aggregation and preserve safe original media links',async()=>{
 for(const country of countries){
  const base={country,term:'أخبار الأسواق المحلية',source:'google',observedAt:'2026-11-26T00:00:00Z',mediaUrl:'https://cdn.example.com/photo.jpg'};
  const rejected=[{...base,term:escaped},{...base,caption:brand},{...base,extra:{label:brand}},{...base,sourceUrl:'https://example.com/ref/only%5Cu%7B66%7Dans'}];
  assert.deepEqual(filterTrendObservations([...rejected,base]),[base]);
  const expected=makeTrendSnapshot(country,'2026-11-26',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-26',[...rejected,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});
test('archive rejects encoded explicit descriptors without changing safe six-country permalinks or request count',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const safe=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),status:'publish',parent:{ID:61269},date:'2026-11-25T10:00:00Z',title:'أخبار الأسواق المحلية',content:'<p>Local economy</p>'};
 });
 const bad=safe.flatMap(row=>[{...row,title:escaped},{...row,content:'<p>'+brand+'</p>'},{...row,excerpt:escaped}]);
 globalThis.fetch=async()=>{requests++;return Response.json({found:safe.length+bad.length,posts:[...bad,...safe]});};
 try{
  const result=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(result.status,200);
  const payload=await result.json();
  assert.deepEqual(payload.items.map((item:{link:string})=>item.link),safe.map(row=>row.URL));
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});
