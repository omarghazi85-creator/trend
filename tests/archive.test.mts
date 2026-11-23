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
  // Weekly material dated Nov 9 was not published until Nov 16.
  assert.equal(body.items[1].date,'2026-11-09');
  assert.equal(body.items[0].date,'2026-11-16');
  assert.equal(body.available_in_window,2);
  assert.equal(body.page,1);
  assert.equal(body.has_more,true);
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

test('bounded pagination advances WordPress.com offset and retains filters',async()=>{
 const original=globalThis.fetch;
 let requested='';
 globalThis.fetch=async(input:RequestInfo|URL)=>{requested=String(input);return Response.json({...payload,found:982});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive?page=2'));
  assert.equal(response.status,200);
  assert.equal((await response.json()).page,2);
  const u=new URL(requested);
  assert.equal(u.searchParams.get('offset'),'100');
  assert.equal(u.searchParams.get('number'),'100');
 }finally{globalThis.fetch=original;}
});
test('invalid pagination fails before any upstream request',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('unexpected upstream call');};
 try{
  for(const page of ['0','-1','11','999','3.5','a']){
   const response=await archive(new Request('https://preview.example/.netlify/functions/archive?page='+page));
   assert.equal(response.status,400,page);
  }
 }finally{globalThis.fetch=original;}
});

test('archive transport excludes disallowed trend titles without additional upstream requests',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({found:3,posts:[
  {...payload.posts[0],ID:300,title:'آمارنا ميلر'},
  {...payload.posts[0],ID:301,title:'سكس بستلس'},
  {...payload.posts[0],ID:302,title:'حصيلة ترندات السودان'}
 ]});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.items.map((x:{title:string})=>x.title),['حصيلة ترندات السودان']);
  assert.equal(body.available_in_window,1);
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});

test('public archive correctly classifies all four additional Arab countries',async()=>{
 const original=globalThis.fetch;
 const entries=[['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']] as const;
 globalThis.fetch=async()=>Response.json({found:4,posts:entries.map(([country,name],i)=>({
  ...payload.posts[0],ID:1100+i,title:'حصيلة كلمات البحث في '+name,
  URL:'https://arabiatrend.com/trend-archive/'+country+'-search-2026-11-21',
  slug:country+'-search-2026-11-21',date:'2026-11-21T10:00:00Z'
 }))});
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.items.map((x:{country:string})=>x.country),entries.map(x=>x[1]));
 }finally{globalThis.fetch=original;}
});

test('rejects mismatched archive slug destinations and normalizes encoded WordPress titles',async()=>{
 const original=globalThis.fetch;
 const same={...payload.posts[0],ID:711,slug:'ma-search-2026-11-16'};
 globalThis.fetch=async()=>Response.json({found:5,posts:[
  {...same,title:'حصيلة &#8211; المغرب',URL:'https://arabiatrend.com/trend-archive/ma-search-2026-11-16/'},
  {...same,ID:712,title:'عنوان مختلف',URL:'https://arabiatrend.com/trend-archive/eg-search-2026-11-16'},
  {...same,ID:713,title:'عنوان آخر',URL:'https://arabiatrend.com/trend-archive/ma-search-2026-11-16?next=external'},
  {...same,ID:714,title:'p&#111;rn archive'},
  {...same,ID:715,title:'عنوان غير صحيح',date:'2026-02-30T10:00:00Z'}
 ]});
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.items.length,1);
  assert.equal(data.items[0].title,'حصيلة – المغرب');
  assert.equal(data.items[0].link,'https://arabiatrend.com/trend-archive/ma-search-2026-11-16/');
 }finally{globalThis.fetch=original;}
});

test('archive period follows dated slugs for Somalia and Sudan even when pages publish later',async()=>{
 const original=globalThis.fetch;
 const entries=[
  {country:'so',day:'2026-11-18',published:'2026-11-21T08:00:00Z',title:'حصيلة كلمات البحث في الصومال'},
  {country:'sd',day:'2026-11-19',published:'2026-11-21T08:00:00Z',title:'حصيلة كلمات البحث في السودان'}
 ];
 globalThis.fetch=async()=>Response.json({found:2,posts:entries.map((x,i)=>({
  ...payload.posts[0],ID:2000+i,title:x.title,
  URL:'https://arabiatrend.com/trend-archive/'+x.country+'-search-'+x.day,
  slug:x.country+'-search-'+x.day,date:x.published
 }))});
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.deepEqual(data.items.map((x:{date:string})=>x.date),['2026-11-18','2026-11-19']);
  assert.ok(data.items.every((x:{link:string})=>x.link.startsWith('https://arabiatrend.com/trend-archive/')));
 }finally{globalThis.fetch=original;}
});
test('malformed dated archive slug is rejected instead of displaying a false day',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({found:1,posts:[{
  ...payload.posts[0],slug:'so-search-2026-02-30',
  URL:'https://arabiatrend.com/trend-archive/so-search-2026-02-30',
  date:'2026-11-21T10:00:00Z'
 }]});
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items,[]);
 }finally{globalThis.fetch=original;}
});

test('archive rejects forbidden links in raw title markup before displaying decoded headline',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const cases=[
  {...payload.posts[0],ID:901,slug:'sd-search-2026-11-21',
   URL:'https://arabiatrend.com/trend-archive/sd-search-2026-11-21',
   title:'حصيلة السودان <a href="https://onlyfans.com/creator">التفاصيل</a>'},
  {...payload.posts[0],ID:902,slug:'so-search-2026-11-21',
   URL:'https://arabiatrend.com/trend-archive/so-search-2026-11-21',
   title:'حصيلة الصومال &lt;img src="https://pornhub.com/preview.jpg"&gt;'},
  {...payload.posts[0],ID:903,slug:'dj-search-2026-11-21',
   URL:'https://arabiatrend.com/trend-archive/dj-search-2026-11-21',
   title:'حصيلة جيبوتي &lt;a href="https://example.com/news"&gt;التفاصيل&lt;/a&gt;'},
  {...payload.posts[0],ID:904,slug:'km-search-2026-11-21',
   URL:'https://arabiatrend.com/trend-archive/km-search-2026-11-21',
   title:'حصيلة جزر القمر'}
 ];
 globalThis.fetch=async()=>{requests++;return Response.json({found:4,posts:cases});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.items.map((entry:{country:string})=>entry.country),['جيبوتي','جزر القمر']);
  assert.equal(body.items[0].title,'حصيلة جيبوتي التفاصيل');
  assert.equal(body.items[1].link,cases[3].URL);
  assert.equal(requests,1,'only one bounded public WordPress API request');
 }finally{globalThis.fetch=original;}
});

test('archive excludes prohibited body or excerpt even when headings are innocuous, without per-page fetches',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const entries=[
  {...payload.posts[0],ID:920,slug:'sd-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/sd-search-2026-11-21',title:'حصيلة السودان',content:'<p>متابعة الأسواق <a href="https://onlyfans.com/creator">مصدر</a></p>'},
  {...payload.posts[0],ID:921,slug:'so-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/so-search-2026-11-21',title:'حصيلة الصومال',excerpt:'خبر &#112;ornhub'},
  {...payload.posts[0],ID:922,slug:'dj-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/dj-search-2026-11-21',title:'حصيلة جيبوتي',content:'متابعة محلية مشروعة',excerpt:'المصدر الأصلي متاح في صفحة التفاصيل'},
  {...payload.posts[0],ID:923,slug:'km-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/km-search-2026-11-21',title:'حصيلة جزر القمر',content:'معلومات الطقس والبحث',excerpt:''}
 ];
 globalThis.fetch=async()=>{requests++;return Response.json({found:4,posts:entries});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.deepEqual(result.items.map((x:{country:string})=>x.country),['جيبوتي','جزر القمر']);
  assert.equal(result.items[0].link,entries[2].URL);
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});

test('archive excludes executable source protocols in the title and body without extra WordPress traffic',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 const items=[
  {...payload.posts[0],slug:'sd-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/sd-search-2026-11-21',
   title:'حصيلة السودان <a href="javascript:alert(1)">قراءة</a>'},
  {...payload.posts[0],slug:'so-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/so-search-2026-11-21',
   title:'حصيلة الصومال',content:'<img src="data:text/html;base64,PHNjcmlwdD4=">'},
  {...payload.posts[0],slug:'dj-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/dj-search-2026-11-21',
   title:'حصيلة جيبوتي',content:'<a href="https://example.com/news">المصدر</a>'},
  {...payload.posts[0],slug:'km-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/km-search-2026-11-21',
   title:'حصيلة جزر القمر',content:'نشرة الاقتصاد والطقس'}
 ];
 globalThis.fetch=async()=>{requests++;return Response.json({found:4,posts:items});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.deepEqual(data.items.map((x:{country:string})=>x.country),['جيبوتي','جزر القمر']);
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});

test('archive transport bounds streamed upstream JSON even with missing or understated length',async()=>{
 const old=globalThis.fetch;
 try{
  for(const declared of [null,'1']){
   let calls=0,pulled=0,cancelled=false;
   globalThis.fetch=async()=>{
    calls++;
    const body=new ReadableStream<Uint8Array>({
     pull(controller){pulled++;controller.enqueue(new Uint8Array(1024*1024));},
     cancel(){cancelled=true;}
    },{highWaterMark:0});
    return new Response(body,{headers:declared===null?{}:{'content-length':declared}});
   };
   const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
   assert.equal(response.status,503);
   const data=await response.json();
   assert.equal(data.error,'archive_temporarily_unavailable');
   assert.deepEqual(data.items,[]);
   assert.equal(calls,1,'one upstream read, no additional WordPress requests');
   assert.equal(cancelled,true,'oversized stream must be cancelled');
   assert.ok(pulled<=9,'stop before reading any unbounded body');
  }
 }finally{globalThis.fetch=old;}
});

test('archive rejects oversized declared upstream JSON without reading the body',async()=>{
 const old=globalThis.fetch;
 try{
  let cancelled=false,reads=0;
  globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({
   pull(controller){reads++;controller.enqueue(new Uint8Array(1));},
   cancel(){cancelled=true;}
  },{highWaterMark:0}),{headers:{'content-length':'8000001'}});
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,503);
  assert.equal(reads,0);
  assert.equal(cancelled,false);
 }finally{globalThis.fetch=old;}
});

test('archive advertises only reachable pages even when public pages exceed the bounded window',async()=>{
 const original=globalThis.fetch;
 let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({found:1038,posts:[]});};
 try{
  const ninth=await archive(new Request('https://preview.example/.netlify/functions/archive?page=9'));
  assert.equal(ninth.status,200);
  const before=await ninth.json();
  assert.equal(before.has_more,true);
  assert.equal(before.window_truncated,true);
  const tenth=await archive(new Request('https://preview.example/.netlify/functions/archive?page=10'));
  assert.equal(tenth.status,200);
  const last=await tenth.json();
  assert.equal(last.has_more,false);
  assert.equal(last.window_truncated,true);
  assert.equal(last.total_public_pages,1038);
  assert.equal(last.max_candidates,1000);
  const invalid=await archive(new Request('https://preview.example/.netlify/functions/archive?page=11'));
  assert.equal(invalid.status,400);
  assert.equal(requests,2);
 }finally{globalThis.fetch=original;}
});
