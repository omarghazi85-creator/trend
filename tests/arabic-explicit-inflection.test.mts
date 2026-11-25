import test from 'node:test';
import assert from 'node:assert/strict';
import {isEditorialTrendAllowed,filterTrendObservations} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';
import archive from '../netlify/functions/archive.mts';
const countries=['sa','eg','sd','so','dj','km'];
const blocked=['الأفلام الإباحية','المحتوى الإباحي','والإباحية','بالإباحية','للإباحيات','فالإباحيون','وَبِالإِبَاحِيَّة','الأفلام الإباح&#x64A;ة'];
const safe=['إباحة استخدام الأراضي','استباحة الممتلكات','أخبار الطقس المحلية','الاقتصاد في السعودية','Essex county'];
test('attached Arabic article and clitic forms of explicit-content descriptors are screened without substring matching',()=>{
 for(const term of blocked)assert.equal(isEditorialTrendAllowed(term),false,term);
 for(const term of safe)assert.equal(isEditorialTrendAllowed(term),true,term);
});
test('six-country pre-admission and snapshot digest exclude explicit inflections without altering media links',async()=>{
 for(const country of countries){
  const row={country,term:'أخبار الطقس المحلية',source:'google',observedAt:'2026-11-25T10:00:00Z',sourceUrl:'https://example.com/news',mediaUrl:'https://cdn.example.com/photo.jpg'};
  const rejected=blocked.flatMap(term=>[{...row,term},{...row,caption:term}]);
  assert.deepEqual(filterTrendObservations([...rejected,row]),[row]);
  const baseline=makeTrendSnapshot(country,'2026-11-25',[row]);
  const actual=makeTrendSnapshot(country,'2026-11-25',[...rejected,row]);
  assert.deepEqual(actual,baseline,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(baseline),country);
 }
});
test('archive screens inflected explicit terms in headings, bodies and excerpts, keeping valid original URLs with one upstream request',async()=>{
 const old=globalThis.fetch;let requests=0;
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),status:'publish',parent:{ID:61269},date:'2026-11-25T10:00:00Z',title:'حصيلة البحث المحلية',content:'<p>أخبار الطقس</p>'};
 });
 const bad=good.flatMap(row=>[{...row,title:blocked[0]},{...row,content:'<p>'+blocked[2]+'</p>'},{...row,excerpt:blocked[3]}]);
 globalThis.fetch=async()=>{requests++;return Response.json({found:good.length+bad.length,posts:[...bad,...good]});};
 try{
  const res=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(res.status,200);
  const data=await res.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(row=>row.URL));
  assert.equal(requests,1);
 }finally{globalThis.fetch=old;}
});
