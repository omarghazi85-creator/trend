import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEditorialText,isEditorialTrendAllowed,isEditorialSourceUrlAllowed,filterTrendObservations} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';
import archive from '../netlify/functions/archive.mts';

const countries=['sa','eg','sd','so','dj','km'];
const bad=['por&shyn','only&shyfans','adult&nbspvideo','por&amp;shyn'];
test('legacy HTML references without semicolons cannot split explicit source names',()=>{
 for(const value of bad)assert.equal(isEditorialTrendAllowed(value),false,value);
 assert.equal(decodeEditorialText('Local&nbspmarkets'),'Local markets');
 assert.equal(isEditorialTrendAllowed('Local&shymarkets'),true);
 assert.equal(isEditorialTrendAllowed('أخبار&nbspالاقتصاد'),true);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/ref/only%26shyfans'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/sports'),true);
});
test('legacy entity variants are removed before six-country snapshots and digest',async()=>{
 for(const country of countries){
  const base={country,term:'أخبار الاقتصاد المحلي',source:'google',observedAt:'2026-11-26T00:00:00Z',sourceUrl:'https://example.com/news',mediaUrl:'https://cdn.example.com/photo.jpg'};
  const rejected=bad.flatMap(label=>[{...base,term:label},{...base,caption:label},{...base,extra:{label}}]);
  rejected.push({...base,sourceUrl:'https://example.com/ref/only%26shyfans'} as typeof rejected[number]);
  assert.deepEqual(filterTrendObservations([...rejected,base]),[base],country);
  const expected=makeTrendSnapshot(country,'2026-11-26',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-26',[...rejected,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});
test('archive screens legacy references in title and body with a single upstream request',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const safe=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),status:'publish',parent:{ID:61269},date:'2026-11-25T10:00:00Z',title:'أخبار&nbspالاقتصاد',content:'<p>Local markets</p>'};
 });
 const denied=safe.flatMap(row=>[{...row,title:bad[0]},{...row,content:'<p>'+bad[1]+'</p>'},{...row,excerpt:bad[2]}]);
 globalThis.fetch=async()=>{requests++;return Response.json({found:safe.length+denied.length,posts:[...denied,...safe]});};
 try{
  const result=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(result.status,200);
  const payload=await result.json();
  assert.deepEqual(payload.items.map((item:{link:string})=>item.link),safe.map(row=>row.URL));
  assert.ok(payload.items.every((item:{title:string})=>item.title==='أخبار الاقتصاد'));
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});
