import test from 'node:test';
import assert from 'node:assert/strict';
import {isEditorialTrendAllowed,filterTrendObservations,isEditorialSourceUrlAllowed} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';
import archive from '../netlify/functions/archive.mts';

const countries=['sa','eg','sd','so','dj','km'];
const blocked=['Pornographic film','PORNOGRAPHIC material','pornographer','pornographers','pornographically explicit material','pornograph&#105;c video'];
const safe=['Local news in Djibouti','Comoros economy','Photography exhibition','Sport news','أخبار الطقس المحلية'];

test('English explicit descriptors are screened without blocking ordinary English reporting',()=>{
 for(const term of blocked)assert.equal(isEditorialTrendAllowed(term),false,term);
 for(const term of safe)assert.equal(isEditorialTrendAllowed(term),true,term);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/pornographic-films'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/sport-news'),true);
});

test('English-language exclusions do not change valid six-country snapshots or original media destinations',async()=>{
 for(const country of countries){
  const row={country,term:'Sport news',source:'google',observedAt:'2026-11-25T10:00:00Z',sourceUrl:'https://example.com/actualites',mediaUrl:'https://cdn.example.com/photo.jpg'};
  const rejected=blocked.flatMap(term=>[{...row,term},{...row,caption:term},{...row,metadata:{label:term}}]);
  assert.deepEqual(filterTrendObservations([...rejected,row]),[row],country);
  const baseline=makeTrendSnapshot(country,'2026-11-25',[row]);
  const actual=makeTrendSnapshot(country,'2026-11-25',[...rejected,row]);
  assert.deepEqual(actual,baseline,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(baseline),country);
 }
});

test('archive screens English descriptors in headings and bodies without extra upstream requests or permalink changes',async()=>{
 const old=globalThis.fetch;let requests=0;
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),status:'publish',parent:{ID:61269},date:'2026-11-25T10:00:00Z',title:'Sport news',content:'<p>Local economy</p>'};
 });
 const bad=good.flatMap(row=>[{...row,title:blocked[0]},{...row,content:'<p>'+blocked[1]+'</p>'},{...row,excerpt:blocked[4]}]);
 globalThis.fetch=async()=>{requests++;return Response.json({found:good.length+bad.length,posts:[...bad,...good]});};
 try{
  const res=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(res.status,200);
  const data=await res.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(row=>row.URL));
  assert.equal(requests,1);
 }finally{globalThis.fetch=old;}
});
