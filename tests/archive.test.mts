import test from 'node:test';
import assert from 'node:assert/strict';
import archive from '../netlify/functions/archive.mts';
const upstream='https://public-api.wordpress.com/rest/v1.1/sites/250183068/posts/?type=page&parent_id=61269&number=100&offset=0';
const payload={found:982,posts:[
 {ID:86289,content:'حصيلة البحث المحلية والطقس والاقتصاد',title:'كلمات البحث الرائجة في المغرب يوم 2026-11-16',URL:'https://arabiatrend.com/trend-archive/ma-search-2026-11-16',slug:'ma-search-2026-11-16',status:'publish',parent:{ID:61269},date:'2026-11-16T14:10:53+00:00'},
 {ID:86291,content:'حصيلة البحث المحلية والطقس والاقتصاد',title:'حصيلة ترندات المغرب',URL:'https://arabiatrend.com/trend-archive/ma-week-2026-11-09',slug:'ma-week-2026-11-09',status:'publish',parent:{ID:61269},date:'2026-11-16T14:10:55+00:00'},
 {ID:999,title:'Unrelated',URL:'https://arabiatrend.com/test',slug:'test',status:'publish',parent:false,date:'2026-11-16T00:00:00+00:00'},
 {ID:991,title:'Spoofed',URL:'https://malicious.example.net/trend-archive/ma-search-2026-11-16',slug:'ma-search-2026-11-16',status:'publish',parent:{ID:61269},date:'2026-11-16T00:00:00+00:00'}
]};
test('uses official public WordPress.com API, one GET, exact archive parent, safe URLs and country codes',async()=>{
 const original=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(String(input));assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');return Response.json(payload);};
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
  assert.equal(u.searchParams.get('parent_id'),'61269');
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


test('archive rejects impossible upstream counts and excess rows with no retries',async()=>{
 const original=globalThis.fetch;
 try{
  for(const data of [{found:-1,posts:[]},{found:1.5,posts:[]},{found:101,posts:Array(101).fill(payload.posts[0])}]){
   let calls=0;
   globalThis.fetch=async()=>{calls++;return Response.json(data);};
   const result=await archive(new Request('https://preview.example/.netlify/functions/archive'));
   assert.equal(result.status,503);
   assert.deepEqual((await result.json()).items,[]);
   assert.equal(calls,1);
  }
 }finally{globalThis.fetch=original;}
});


test('archive links remain single-segment and have visible headlines across priority countries',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((c,i)=>({...payload.posts[0],ID:3000+i,slug:c+'-search-2026-11-21',URL:'https://arabiatrend.com/trend-archive/'+c+'-search-2026-11-21',title:'حصيلة كلمات البحث'}));
 const bad=[
  {...good[2],slug:'sd-search-2026-11-21/other',URL:good[2].URL+'/other'},
  {...good[3],slug:'so-search-2026-11-21%2fother',URL:good[3].URL+'%2fother'},
  {...good[4],title:'&lt;b&gt; &lt;/b&gt;'},
  {...good[5],title:'   '}
 ];
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:10,posts:[...good,...bad]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive rejects normalized lookalikes but preserves exact links for six priority countries',async()=>{
 const original=globalThis.fetch;
 const good=['sa','eg','sd','so','dj','km'].map((c,i)=>{
  const slug=c+'-search-2026-11-21';
  return {...payload.posts[0],ID:4000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),title:'حصيلة البحث'};
 });
 const bad=[
  {...good[0],URL:good[0].URL.replace('/trend-archive/','/other/../trend-archive/')},
  {...good[1],URL:good[1].URL.replace('/trend-archive/','/trend-archive/%2e/')},
  {...good[2],URL:good[2].URL.replace('/trend-archive/','\\trend-archive\\')},
  {...good[3],URL:' '+good[3].URL},
  {...good[4],URL:good[4].URL+'#'},
  {...good[5],URL:good[5].URL+'?'}
 ];
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:12,posts:[...good,...bad]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('archive never follows upstream redirects to another host or makes a second request',async()=>{
 const original=globalThis.fetch;
 try{
  for(const status of [301,302,307,308]){
   let calls=0;
   globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls++;
    assert.equal(String(input),upstream);
    assert.equal(init?.redirect,'error');
    return new Response(null,{status,headers:{location:'https://example.invalid/other'}});
   };
   const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
   assert.equal(response.status,503);
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual((await response.json()).items,[]);
   assert.equal(calls,1);
  }
 }finally{globalThis.fetch=original;}
});


test('archive hides unverified body links and preserves screened pages for six priority countries',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-21';
  return {...payload.posts[0],ID:5000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug,title:'حصيلة البحث',content:'<p>متابعة الاقتصاد والطقس</p>'};
 });
 const missing=good.map(({content,...page})=>page);
 const invalid=[{...good[0],content:''},{...good[1],content:null},{...good[2],content:'   '},{...good[3],content:'<p> </p>'},{...good[4],content:42},{...good[5],content:'<p><a href="https://onlyfans.com/creator">المصدر</a></p>'}];
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:18,posts:[...missing,...invalid,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive screens retained slugs without changing legitimate country links or upstream request count',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const make=(slug:string,index:number)=>({...payload.posts[0],ID:6000+index,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(index%2?'/':''),title:'حصيلة البحث المحلية',content:'متابعة الاقتصاد والطقس'});
 const good=countries.flatMap((c,i)=>[make(c+'-search-2026-11-21',i*2),make(c+'-music-2026-11-21-2',i*2+1)]);
 const bad=countries.flatMap((c,i)=>['onlyfans','only-fans','p-o-r-n-h-u-b'].map((suffix,j)=>make(c+'-search-'+suffix,100+i*3+j)));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:good.length+bad.length,posts:[...bad,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const result=await r.json();
  assert.deepEqual(result.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(result.available_in_window,good.length);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive rejects malformed full publication timestamps while preserving original dates and URLs across six countries',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const valid=['2026-11-22T00:30:00+03:00','2026-11-22T19:30:00-05:00','2026-11-22T00:30:00.123Z'];
 const invalid=['2026-11-22','2026-11-22T00:30:00','2026-11-22T24:00:00Z','2026-11-22T00:60:00Z','2026-11-22T00:30:60Z','2026-11-22T00:30:00+25:00','2026-11-22T00:30:00-00:90','2026-11-22T00:30:00Zjunk','2026-11-22T00:30:00Z\n','2026-02-30T00:30:00Z'];
 const make=(country:string,date:string,i:number)=> {
  const slug=country+'-search-2026-11-21-'+i;
  return {...payload.posts[0],ID:7000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug,title:'حصيلة البحث المحلية',date};
 };
 const good=countries.flatMap((c,i)=>valid.map((date,j)=>make(c,date,100+i*3+j)));
 const bad=countries.flatMap((c,i)=>invalid.map((date,j)=>make(c,date,200+i*10+j)));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:good.length+bad.length,posts:[...bad,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const result=await r.json();
  assert.deepEqual(result.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.deepEqual(result.items.map((x:{date_iso:string})=>x.date_iso),good.map(x=>x.date));
  assert.ok(result.items.every((x:{date:string})=>x.date==='2026-11-21'));
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive returns plain decoded headlines across priority countries without changing canonical links',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const make=(country:string,index:number,title:string)=>{
  const slug=country+'-search-2026-11-21-'+index;
  return {...payload.posts[0],ID:9000+index,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(index%2?'/':''),title};
 };
 const good=countries.map((c,i)=>make(c,i,'&amp;lt;b&amp;gt;حصيلة البحث&amp;lt;/b&amp;gt; &amp;#8211; '+c.toUpperCase()));
 const invalid=countries.map((c,i)=>make(c,i+10,'&amp;lt;b&amp;gt; &amp;lt;/b&amp;gt;'));
 const excluded=countries.map((c,i)=>make(c,i+20,'حصيلة البحث &amp;#112;ornhub'));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:18,posts:[...invalid,...excluded,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const result=await r.json();
  assert.deepEqual(result.items.map((x:{title:string})=>x.title),countries.map(c=>'حصيلة البحث – '+c.toUpperCase()));
  assert.deepEqual(result.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(result.available_in_window,6);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive removes quoted tag attributes and hidden comments while retaining canonical country links',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const make=(country:string,index:number,title:string)=>{
  const slug=country+'-search-2026-11-21-'+index;
  return {...payload.posts[0],ID:9500+index,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+'/',title};
 };
 const good=countries.map((c,i)=>make(c,i,'<b title="1 > 0">حصيلة البحث</b><!-- internal note --> '+c.toUpperCase()));
 const empty=countries.map((c,i)=>make(c,i+10,'<span title="1 > 0"></span><!-- internal note -->'));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:12,posts:[...empty,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const result=await r.json();
  assert.deepEqual(result.items.map((x:{title:string})=>x.title),countries.map(c=>'حصيلة البحث '+c.toUpperCase()));
  assert.deepEqual(result.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.equal(result.available_in_window,6);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive rejects non-rendered document fragments in headlines without altering valid country links',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-21';
  return {...payload.posts[0],ID:9000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),title:'حصيلة <b>البحث</b>'};
 });
 const fragments=['<style>.class{display:none}</style>','&lt;template&gt;hidden text&lt;/template&gt;',
  '<noscript>fallback text</noscript>','<HEAD>hidden metadata</HEAD>',
  '&amp;lt;style&amp;gt;CSS&amp;lt;/style&amp;gt;','<template>unfinished'];
 const bad=good.map((row,i)=>({...row,ID:9100+i,title:'حصيلة البحث '+fragments[i]}));
 let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({found:12,posts:[...bad,...good]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.deepEqual(data.items.map((x:{title:string})=>x.title),good.map(()=> 'حصيلة البحث'));
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;}
});

test('archive and observation gate agree on hidden and unfinished headings across six countries',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {...payload.posts[0],ID:12000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),title:'حصيلة <b>البحث</b> 5 < 10',content:'<p>أخبار الطقس</p>'};
 });
 const fragments=['<textarea>hidden</textarea>','<iframe>hidden</iframe>','<title>hidden</title>',
  '<!-- unfinished','&lt;span title=&quot;unfinished','</span','<!DOCTYPE html','<?xml'];
 const bad=good.flatMap((row,i)=>fragments.map((fragment,j)=>({...row,ID:13000+i*10+j,title:'حصيلة البحث '+fragment})));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:good.length+bad.length,posts:[...bad,...good]});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.deepEqual(data.items.map((x:{title:string})=>x.title),good.map(()=> 'حصيلة البحث 5 < 10'));
  assert.equal(data.available_in_window,6);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('archive title display limit preserves Unicode and rechecks the actual public label',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const prefix='أ'.repeat(239);
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {...payload.posts[0],ID:14000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),title:prefix+'🌧️ توقعات الطقس',content:'<p>أخبار الطقس</p>'};
 });
 const bad=good.map((row,i)=>({...row,ID:15000+i,title:'أ'.repeat(236)+' sextant'}));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:12,posts:[...bad,...good]});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.deepEqual(data.items.map((x:{title:string})=>x.title),good.map(()=>prefix+'🌧'));
  assert.equal(data.available_in_window,6);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('dated archive slugs with several suffix segments keep the trend day and exact URL',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-19-local-update';
  return {...payload.posts[0],ID:16000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),date:'2026-11-25T10:00:00Z',title:'حصيلة البحث المحلية'};
 });
 const bad=good.map((row,i)=>({...row,ID:17000+i,slug:row.slug.replace('2026-11-19','2026-02-30'),URL:row.URL.replace('2026-11-19','2026-02-30')}));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:12,posts:[...bad,...good]});};
 try{
  const response=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),good.map(x=>x.URL));
  assert.deepEqual(data.items.map((x:{date:string})=>x.date),good.map(()=> '2026-11-19'));
  assert.equal(data.available_in_window,6);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});


test('archive deduplicates admitted canonical destinations without rewriting the first accepted link',async()=>{
 const original=globalThis.fetch;
 const countries=['sa','eg','sd','so','dj','km'];
 const good=countries.map((country,i)=>{
  const slug=country+'-search-2026-11-25';
  return {...payload.posts[0],ID:18000+i,slug,URL:'https://arabiatrend.com/trend-archive/'+slug+(i%2?'/':''),title:'حصيلة البحث المحلية'};
 });
 const rejected=good.map((row,i)=>({...row,ID:18100+i,content:''}));
 const duplicates=good.map((row,i)=>({...row,URL:row.URL.endsWith('/')?row.URL.slice(0,-1):row.URL+'/'}));
 const separate=good.map((row,i)=>({...row,ID:18200+i,slug:row.slug+'-2',URL:'https://arabiatrend.com/trend-archive/'+row.slug+'-2'}));
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({found:24,posts:[...rejected,...good,...duplicates,...separate]});};
 try{
  const r=await archive(new Request('https://preview.example/.netlify/functions/archive'));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.deepEqual(data.items.map((x:{link:string})=>x.link),[...good,...separate].map(x=>x.URL));
  assert.equal(data.available_in_window,12);
  assert.equal(data.total_public_pages,24);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
