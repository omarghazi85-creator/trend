import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrendKey,makeTrendSnapshot,snapshotDigest,needsUpdate} from '../src/trends.mts';
test('Arabic equivalents normalize to one key',()=>assert.equal(normalizeTrendKey('إِعلام   العَرَبِية'),normalizeTrendKey('اعلام العربيه')));
test('duplicate observations merge rather than trigger duplicate write',async()=>{
 const row={country:'sa',term:'الطقس غدًا',source:'google',observedAt:'2026-11-11T08:00:00Z',score:51};
 const single=makeTrendSnapshot('sa','2026-11-11',[row]);
 const duplicate=makeTrendSnapshot('sa','2026-11-11',[row,row]);
 assert.equal(single.terms.length,1);
 assert.equal(await snapshotDigest(single),await snapshotDigest(duplicate));
 assert.equal(needsUpdate(await snapshotDigest(single),await snapshotDigest(duplicate)),false);
});
test('order independence when observations are duplicates',async()=>{
 const a={country:'sa',term:'المطر',source:'google',observedAt:'2026-11-11T08:00:00Z',score:42};
 const b={country:'sa',term:'المطر',source:'youtube',observedAt:'2026-11-11T09:00:00Z',score:43};
 assert.equal(await snapshotDigest(makeTrendSnapshot('sa','2026-11-11',[a,b])),await snapshotDigest(makeTrendSnapshot('sa','2026-11-11',[b,a])));
});
test('reject invalid dates',()=>assert.throws(()=>makeTrendSnapshot('sa','2026-02-30',[])));
test('reject excessive input',()=>assert.throws(()=>makeTrendSnapshot('sa','2026-11-11',Array.from({length:2001},()=>({country:'sa',term:'x',source:'google',observedAt:'2026-11-11T01:00:00Z'})))));

test('mixed Arabic spelling variants produce a stable digest regardless of input order',async()=>{
 const a={country:'sa',term:'إعلام',source:'google',observedAt:'2026-11-11T08:00:00Z',score:18};
 const b={country:'sa',term:'اعلام',source:'youtube',observedAt:'2026-11-11T09:00:00Z',score:20};
 const first=makeTrendSnapshot('sa','2026-11-11',[a,b]);
 const reverse=makeTrendSnapshot('sa','2026-11-11',[b,a]);
 assert.equal(first.terms.length,1);
 assert.equal(await snapshotDigest(first),await snapshotDigest(reverse));
});
test('malformed source entries do not abort the whole daily batch',()=>{
 const rows=[{country:'sa',term:'أخبار',source:'google',observedAt:'2026-11-11T09:00:00Z'},null,{country:'sa',term:10,source:'google',observedAt:'2026-11-11T09:00:00Z'}];
 assert.equal(makeTrendSnapshot('sa','2026-11-11',rows as any).terms.length,1);
});

test('editorial exclusions occur before snapshots, deduplication and digest generation',async()=>{
 const clean={country:'sd',term:'تحلية المياه',source:'google',observedAt:'2026-11-21T11:00:00Z',score:30};
 const forbidden={...clean,term:'آمارنا ميلر',score:99};
 const normal=makeTrendSnapshot('sd','2026-11-21',[clean]);
 const filtered=makeTrendSnapshot('sd','2026-11-21',[forbidden,clean]);
 assert.deepEqual(filtered,normal);
 assert.equal(await snapshotDigest(filtered),await snapshotDigest(normal));
 assert.equal(filtered.terms.length,1);
 assert.equal(filtered.terms[0].term,'تحلية المياه');
});
test('snapshots do not retain blocked-only observations or leak their labels',()=>{
 const r={country:'so',term:'OnlyFans',source:'youtube',observedAt:'2026-11-21T10:00:00Z'};
 const snapshot=makeTrendSnapshot('so','2026-11-21',[r]);
 assert.equal(snapshot.terms.length,0);
 assert.equal(JSON.stringify(snapshot).includes(r.term),false);
});


test('only the 22 supported Arab countries can produce external shadow snapshots',()=>{
 const allowed='sa ae eg kw qa bh om jo lb iq sy sd ps ye ly tn dz ma mr so dj km'.split(' ');
 for(const country of allowed)assert.doesNotThrow(()=>makeTrendSnapshot(country,'2026-11-21',[]),country);
 for(const country of ['zz','us','il','xx','SA','s1',''])assert.throws(()=>makeTrendSnapshot(country,'2026-11-21',[]),/invalid_country_or_day/,country);
});

test('invisible marks and encoded HTML normalize before raw snapshot output and digest',async()=>{
 const base={country:'sd',term:'الطقس اليوم',source:'google',observedAt:'2026-11-21T11:00:00Z'};
 const hidden={...base,term:'الطقس\u200D اليوم'};
 const html={...base,term:'الطقس <b>اليوم</b>'};
 const entity={...base,term:'الطقس &#1575;&#1604;&#1610;&#1608;&#1605;'};
 const clean=makeTrendSnapshot('sd','2026-11-21',[base]);
 const combined=makeTrendSnapshot('sd','2026-11-21',[hidden,html,entity,base]);
 assert.equal(combined.terms.length,1);
 assert.equal(combined.terms[0].term,'الطقس اليوم');
 assert.equal(await snapshotDigest(clean),await snapshotDigest(combined));
 assert.equal(normalizeTrendKey('الطقس\u200D اليوم'),normalizeTrendKey('الطقس اليوم'));
});

test('percent-obfuscated observations never enter shadow snapshots or their digest',async()=>{
 const safe={country:'sd',term:'الطقس اليوم',source:'google',observedAt:'2026-11-21T11:00:00Z'};
 const excluded=[
  {...safe,term:'porn%68ub'},
  {...safe,term:'only%252566ans'},
  {...safe,term:'only&amp;#37;66ans'},
  {...safe,source:'porn%68ub'}
 ];
 const clean=makeTrendSnapshot('sd','2026-11-21',[safe]);
 const mixed=makeTrendSnapshot('sd','2026-11-21',[...excluded,safe]);
 assert.deepEqual(mixed,clean);
 assert.equal(await snapshotDigest(mixed),await snapshotDigest(clean));
 assert.equal(JSON.stringify(mixed).includes('porn'),false);
});
test('valid percent-encoded benign titles are decoded before display and deduplication',async()=>{
 const safe={country:'so',term:'الطقس اليوم',source:'google',observedAt:'2026-11-21T11:00:00Z'};
 const encoded={...safe,term:'الطقس%20اليوم'};
 const a=makeTrendSnapshot('so','2026-11-21',[safe]);
 const b=makeTrendSnapshot('so','2026-11-21',[safe,encoded]);
 assert.deepEqual(b,a);
 assert.equal(await snapshotDigest(b),await snapshotDigest(a));
 assert.equal(makeTrendSnapshot('km','2026-11-21',[{...safe,country:'km',term:'نمو 25% في جزر القمر'}]).terms.length,1);
});

test('new countries discard forbidden raw descriptions and media links before snapshot digests',async()=>{
 const cases=['sd','so','dj','km'];
 for(const country of cases){
  const safe={country,day:'2026-11-21',term:'أخبار الأسواق المحلية',source:'google',observedAt:'2026-11-21T11:00:00Z',caption:'تقرير محلي'};
  const bad=[
   {...safe,description:'only%252566ans'},
   {...safe,summary:'إعلان <img src="data:text/html;base64,AAAA">'},
   {...safe,mediaUrl:'https://onlyfans.com/image'},
   {...safe,originalUrl:'https://example.com/%70ornhub'}
  ];
  const baseline=makeTrendSnapshot(country,'2026-11-21',[safe]);
  const guarded=makeTrendSnapshot(country,'2026-11-21',[...bad,safe]);
  assert.deepEqual(guarded,baseline,country);
  assert.equal(await snapshotDigest(guarded),await snapshotDigest(baseline),country);
 }
});

test('executable markup in raw observation fields is rejected before country snapshot digest',async()=>{
 const countries=['sd','so','dj','km'];
 for(const country of countries){
  const base={country,term:'الأسواق المحلية',source:'google',observedAt:'2026-11-22T09:00:00Z',description:'نشرة اقتصادية'};
  const unsafe=[
   {...base,term:'تقرير <img src="https://example.com/a.jpg" onerror="alert(1)">'},
   {...base,description:'تفاصيل <svg onload="alert(1)"></svg>'},
   {...base,summary:'<script src="https://example.com/widget.js"></script>'}
  ];
  const baseline=makeTrendSnapshot(country,'2026-11-22',[base]);
  const guarded=makeTrendSnapshot(country,'2026-11-22',[...unsafe,base]);
  assert.deepEqual(guarded,baseline,country);
  assert.equal(await snapshotDigest(guarded),await snapshotDigest(baseline),country);
 }
});


test('four-country shadow snapshots discard excluded feed aliases before aggregation and digest',async()=>{
 for(const country of ['sd','so','dj','km']){
  const base={country,term:'أسعار الأسواق المحلية',source:'google',observedAt:'2026-11-22T11:00:00Z',
   permalink:'https://example.com/markets',thumbnail_url:'https://example.com/photo.jpg',provider:'نشرة محلية'};
  const excluded=[
   {...base,provider:'OnlyFans'},
   {...base,body:'<a href="https://onlyfans.com">متابعة</a>'},
   {...base,permalink:'https://onlyfans.com/profile'},
   {...base,thumbnail_url:'https://pornhub.com/photo.jpg'},
   {...base,source_url:'https://example.com/%70ornhub'}
  ];
  const expected=makeTrendSnapshot(country,'2026-11-22',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-22',[...excluded,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});

test('structured RSS media objects and links are excluded before four-country snapshot digests',async()=>{
 for(const country of ['sd','so','dj','km']){
  const base={country,term:'تقرير الأسواق',source:'google',observedAt:'2026-11-22T10:00:00Z',
   enclosure:{url:'https://example.com/audio.mp3',type:'audio/mpeg'}};
  const blocked=[
   {...base,enclosure:{url:'https://onlyfans.com/clip'}},
   {...base,links:[{href:'https://example.com/ok'},{href:'https://pornhub.com/clip'}]},
   {...base,'media:content':[{url:'https://onlyfans.com/photo'}]},
   {...base,media:{thumbnail:{url:'javascript:alert(1)'}}}
  ];
  const clean=makeTrendSnapshot(country,'2026-11-22',[base]);
  const observed=makeTrendSnapshot(country,'2026-11-22',[...blocked,base]);
  assert.deepEqual(observed,clean,country);
  assert.equal(await snapshotDigest(observed),await snapshotDigest(clean),country);
 }
});

test('four-country snapshots reject encoded zero-width terms before digesting',async()=>{
 for(const country of ['sd','so','dj','km']){
  const base={country,term:'أخبار الأسواق',source:'google',observedAt:'2026-11-22T09:00:00Z'};
  const blocked=[
   {...base,term:'Only&shy;Fans'},
   {...base,caption:'Only&NoBreak;Fans'},
   {...base,'media:thumbnail':{url:'https://example.com/ok.jpg',caption:'p&zwj;ornhub'}},
  ];
  const expected=makeTrendSnapshot(country,'2026-11-22',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-22',[...blocked,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});


test('unknown provider metadata is checked before four-country snapshot aggregation and hashing',async()=>{
 for(const country of ['sd','so','dj','km']){
  const base={country,term:'أسواق محلية',source:'google',observedAt:'2026-11-22T09:00:00Z',
   extra:{labels:['الاقتصاد'],trackingUrl:'https://example.com/trends'}};
  const rejected=[
   {...base,extra:{caption:'OnlyFans'}},
   {...base,analytics:{destinationUrl:'https://pornhub.com/landing'}},
   {...base,extra:{links:[{targetUrl:'https://onlyfans.com/channel'}]}}
  ];
  const expected=makeTrendSnapshot(country,'2026-11-22',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-22',[...rejected,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});


test('disallowed provider object keys never affect snapshots in the four underrepresented countries',async()=>{
 for(const country of ['sd','so','dj','km']){
  const safe={country,term:'الأسواق المحلية',source:'google',observedAt:'2026-11-22T10:00:00Z',
   extra:{trackingUrl:'https://example.com/markets'}};
  const excluded=[
   {...safe,extra:{OnlyFans:'معلومة'}},
   {...safe,extra:{'p%6frnhub':1}},
   {...safe,metadata:{OnlyFansCampaign:{label:'بيانات'}}}
  ];
  const baseline=makeTrendSnapshot(country,'2026-11-22',[safe]);
  const actual=makeTrendSnapshot(country,'2026-11-22',[...excluded,safe]);
  assert.deepEqual(actual,baseline,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(baseline),country);
 }
});
