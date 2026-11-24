import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTrendObservations,isEditorialSourceUrlAllowed} from '../src/trend-policy.mts';
import {validateCandidate} from '../src/core.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';

test('editorial source gate accepts safe HTTPS destinations and blocks prohibited domains and encoded paths',()=>{
 for(const url of [
  'https://trends.google.com/trends/explore?q=al-ahly',
  'https://www.example.com/articles/Essex-county?lang=en'
 ])assert.equal(isEditorialSourceUrlAllowed(url),true,url);
 for(const url of [
  'https://onlyfans.com/creator','https://pornhub.com/watch',
  'https://media.example/watch/%70orn','https://media.example/?q=only%46ans',
  'https://media.example/watch/p%2526%23111%3Brn',
  'https://media.example/watch/%25252570orn',
  'https://media.example/watch/%2500porn',
  'http://news.example/story','https://user:password@example.com/story',
  'https://news.example.com/with space',null
 ])assert.equal(isEditorialSourceUrlAllowed(url),false,String(url));
});

test('observation gate drops neutral titles linking to excluded sources',()=>{
 const items=[
  {title:'نتائج الدوري',url:'https://example.com/sports/league'},
  {title:'نتائج الدوري',url:'https://onlyfans.com/news'},
  {title:'الطقس اليوم',sourceUrl:'https://media.example/?q=OnlyFans'},
  {title:'الطقس اليوم',sourceUrl:'https://example.com/weather'}
 ];
 assert.deepEqual(filterTrendObservations(items),[items[0],items[3]]);
});

test('draft validation prevents prohibited source URL before any WordPress writes',()=>{
 const base={title:'ملخص تقني موثوق للقراءة',slug:'technology-news-2026',content:'هذا تقرير عربي موثوق ومراجع '.repeat(10)};
 assert.throws(()=>validateCandidate({...base,sourceUrl:'https://onlyfans.com/creator'}),/editorial_source_blocked/);
 assert.throws(()=>validateCandidate({...base,sourceUrl:'https://example.com/%70orn'}),/editorial_source_blocked/);
 assert.equal(validateCandidate({...base,sourceUrl:'https://example.com/sports'}).sourceUrl,'https://example.com/sports');
});

test('source exclusions occur before snapshot aggregation and digest while keeping a legitimate source',async()=>{
 const base={country:'sd',term:'الرياضة المحلية',source:'google',observedAt:'2026-11-21T11:00:00Z'};
 const disallowedDomain={...base,source:'youtube',sourceUrl:'https://onlyfans.com/creator'};
 const disallowedSource={...base,source:'pornhub'};
 const disallowedUrlAlias={...base,source:'news',url:'https://onlyfans.com/profile'};
 const disallowedDeepUrl={...base,source:'social',sourceUrl:'https://media.example/watch/%25252570orn'};
 const clean=makeTrendSnapshot('sd','2026-11-21',[base]);
 const mixed=makeTrendSnapshot('sd','2026-11-21',[disallowedDomain,disallowedSource,disallowedUrlAlias,disallowedDeepUrl,base]);
 assert.deepEqual(clean,mixed);
 assert.equal(await snapshotDigest(clean),await snapshotDigest(mixed));
 assert.deepEqual(mixed.terms[0].sources,['google']);
});
test('source URLs and pre-aggregation rows fail closed on percent-obfuscated prohibited labels',async()=>{
 for(const url of ['https://example.com/%70ornhub','https://example.com/only%252566ans'])
  assert.equal(isEditorialSourceUrlAllowed(url),false,url);
 const safe={country:'dj',term:'الطقس اليوم',source:'google',observedAt:'2026-11-21T11:00:00Z'};
 const excluded={...safe,sourceUrl:'https://media.example/only%252566ans'};
 const baseline=makeTrendSnapshot('dj','2026-11-21',[safe]);
 const guarded=makeTrendSnapshot('dj','2026-11-21',[safe,excluded]);
 assert.deepEqual(guarded,baseline);
 assert.equal(await snapshotDigest(guarded),await snapshotDigest(baseline));
});

test('WordPress draft preparation rejects excluded media destinations embedded in article HTML',()=>{
 const base={title:'تحليل موسع لأخبار التقنية العربية',slug:'regional-tech-review-2026',
  content:'هذا تقرير تحريري مفصل عن التطورات المهنية والتقنية '.repeat(10)};
 assert.doesNotThrow(()=>validateCandidate({...base,content:base.content+'<p><a href="https://example.com/news">المصدر</a></p>'}));
 assert.throws(()=>validateCandidate({...base,content:base.content+'<a href="https://onlyfans.com/creator">رابط المصدر</a>'}),/editorial_content_blocked/);
 assert.throws(()=>validateCandidate({...base,content:base.content+'<img src="https://pornhub.com/image.jpg">'}),/editorial_content_blocked/);
});

test('raw feed metadata cannot conceal prohibited content or media origins before admission',()=>{
 const safe=[
  {title:'ملخص السودان',description:'تقرير عن المناخ',mediaUrl:'https://example.com/sudan.jpg'},
  {title:'ملخص الصومال',excerpt:'الطقس المحلي'},
  {title:'ملخص جيبوتي',caption:'صورة أرشيفية'},
  {title:'ملخص جزر القمر',summary:'بيانات اقتصادية',link:'https://example.com/markets'}
 ];
 const rejected=[
  {...safe[0],description:'مصدر &#79;nlyFans'},
  {...safe[1],excerpt:'رابط إلى https://pornhub.com/creator'},
  {...safe[2],caption:'only%252566ans'},
  {...safe[3],summary:'خبر <a href="javascript:alert(1)">المصدر</a>'},
  {...safe[0],mediaUrl:'https://onlyfans.com/creator'},
  {...safe[3],link:'https://example.com/%70ornhub'},
  {...safe[2],originalUrl:'http://example.com/image'}
 ];
 const original=JSON.stringify([...safe,...rejected]);
 assert.deepEqual(filterTrendObservations([...safe,...rejected]),safe);
 assert.equal(JSON.stringify([...safe,...rejected]),original,'do not mutate upstream records');
});


test('separator-obfuscated source names are blocked in observations and URLs before six-country snapshots',async()=>{
 const countries=['sd','so','dj','km','sa','eg'];
 for(const country of countries){
  const safe={country,term:'مؤشرات الأسواق',source:'google',observedAt:'2026-11-23T06:00:00Z',
   sourceUrl:'https://example.com/markets',extra:{note:'التجارة المحلية'}};
  const excluded=[
   {...safe,provider:'Only-Fans'},
   {...safe,description:'إحالة إلى p.o.r.n.h.u.b'},
   {...safe,extra:{partner:'x_videos'}},
   {...safe,media:{caption:'x.n.x.x'}},
   {...safe,sourceUrl:'https://example.com/ref/only_fans'},
   {...safe,originalUrl:'https://example.com/links/x-hamster'},
   {...safe,summary:'red·tube'},
   {...safe,media:{link:{href:'https://example.com/y.o.u.p.o.r.n'}}}
  ];
  assert.deepEqual(filterTrendObservations([safe,...excluded]),[safe],country);
  const baseline=makeTrendSnapshot(country,'2026-11-23',[safe]);
  const filtered=makeTrendSnapshot(country,'2026-11-23',[...excluded,safe]);
  assert.deepEqual(filtered,baseline,country);
  assert.equal(await snapshotDigest(filtered),await snapshotDigest(baseline),country);
 }
 for(const url of ['https://example.com/ref/only.fans','https://example.com/p.o.r.n.h.u.b',
  'https://example.com/x_videos'])assert.equal(isEditorialSourceUrlAllowed(url),false,url);
 for(const url of ['https://example.com/fans','https://example.com/essex-county'])
  assert.equal(isEditorialSourceUrlAllowed(url),true,url);
});


test('named HTML5 entities in source links are rejected before six-country shadow snapshots',async()=>{
 const countries=['sa','eg','sd','so','dj','km'];
 for(const country of countries){
  const base={country,term:'أخبار الأسواق المحلية',source:'google',
   observedAt:'2026-11-23T07:00:00Z',sourceUrl:'https://example.com/economy'};
  const rejected=[
   {...base,sourceUrl:'https://example.com/ref/only&period;fans'},
   {...base,originalUrl:'https://example.com/ref/only&hyphen;fans'},
   {...base,caption:'تقرير <a href="javascript&colon;alert(1)">الرابط</a>'},
   {...base,extra:{sponsor:'p&period;o&period;r&period;n&period;h&period;u&period;b'}}
  ];
  assert.deepEqual(filterTrendObservations([base,...rejected]),[base],country);
  const expected=makeTrendSnapshot(country,'2026-11-23',[base]);
  const filtered=makeTrendSnapshot(country,'2026-11-23',[...rejected,base]);
  assert.deepEqual(filtered,expected,country);
  assert.equal(await snapshotDigest(filtered),await snapshotDigest(expected),country);
 }
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/ref/only&period;fans'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/ref/only&hyphen;fans'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/economy'),true);
});

test('spaced excluded source names never enter six-country shadow snapshots or digests',async()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const safe={country,term:'مؤشرات الأسواق المحلية',source:'google',
   observedAt:'2026-11-23T08:00:00Z',sourceUrl:'https://example.com/markets'};
  const excluded=[
   {...safe,term:'p o r n h u b'},
   {...safe,description:'مروج o n l y f a n s'},
   {...safe,provider:'x v i d e o s'},
   {...safe,extra:{partner:'x h a m s t e r'}},
   {...safe,sourceUrl:'https://example.com/ref/p%20o%20r%20n%20h%20u%20b'},
   {...safe,media:{label:'r e d t u b e'}}
  ];
  assert.deepEqual(filterTrendObservations([...excluded,safe]),[safe],country);
  const baseline=makeTrendSnapshot(country,'2026-11-23',[safe]);
  const guarded=makeTrendSnapshot(country,'2026-11-23',[...excluded,safe]);
  assert.deepEqual(guarded,baseline,country);
  assert.equal(await snapshotDigest(guarded),await snapshotDigest(baseline),country);
 }
 for(const destination of [
  'https://example.com/ref/p%20o%20r%20n%20h%20u%20b',
  'https://example.com/ref/o%20n%20l%20y%20f%20a%20n%20s'
 ])assert.equal(isEditorialSourceUrlAllowed(destination),false,destination);
 for(const destination of ['https://example.com/markets','https://example.com/fans','https://example.com/sports'])
  assert.equal(isEditorialSourceUrlAllowed(destination),true,destination);
});

test('slash-separated HTML attributes and oversized tags cannot bypass admission for six countries',async()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const safe={country,term:'بيانات الأسواق العربية',source:'google',observedAt:'2026-11-23T08:00:00Z',
   sourceUrl:'https://example.com/markets',description:'خبر <a href="https://example.com/path/onload=ready">السوق</a>'};
  const unsafe=[
   {...safe,description:'خبر <svg/onload=alert(1)>بيانات</svg>'},
   {...safe,caption:'خبر <img/src="javascript:alert(1)">'},
   {...safe,content:'خبر <iframe/srcdoc="<script>alert(1)</script>"></iframe>'},
   {...safe,description:'خبر <a data-padding="'+ 'x'.repeat(4100) +'" onmouseover="alert(1)">السوق</a>'}
  ];
  assert.deepEqual(filterTrendObservations([...unsafe,safe]),[safe],country);
  const baseline=makeTrendSnapshot(country,'2026-11-23',[safe]);
  const guarded=makeTrendSnapshot(country,'2026-11-23',[...unsafe,safe]);
  assert.deepEqual(guarded,baseline,country);
  assert.equal(await snapshotDigest(guarded),await snapshotDigest(baseline),country);
 }
});

test('escaped Unicode aliases never enter six-country shadow snapshots',async()=>{
 const slash=String.fromCharCode(92);
 for(const country of ['sa','eg','sd','so','dj','km']){
  const safe={country,term:'أخبار الأسواق',source:'google',
   observedAt:'2026-11-23T09:00:00Z',sourceUrl:'https://example.com/market'};
  const unsafe=[
   {...safe,term:'only'+slash+'u0066ans'},
   {...safe,provider:'p'+slash+'x6frnhub'},
   {...safe,description:'p'+slash+'u006frnhub'},
   {...safe,sourceUrl:'https://example.com/ref/only%5Cu0066ans'},
   {...safe,extra:{publisher:'only'+slash+'u0066ans'}}
  ];
  assert.deepEqual(filterTrendObservations([safe,...unsafe]),[safe],country);
  const baseline=makeTrendSnapshot(country,'2026-11-23',[safe]);
  const filtered=makeTrendSnapshot(country,'2026-11-23',[...unsafe,safe]);
  assert.deepEqual(filtered,baseline,country);
  assert.equal(await snapshotDigest(filtered),await snapshotDigest(baseline),country);
 }
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/ref/only%5Cu0066ans'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/news'),true);
});


test('concealed destinations in arbitrary metadata never alter six-country shadow snapshots',async()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'نتائج الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T05:00:00Z',sourceUrl:'https://example.com/markets',
   extra:{destination:'https://example.com/economy',note:'البيانات: نمو 25%'}};
  const bad=[
   {...base,extra:{destination:' javascript:alert(1)'}},
   {...base,extra:{destination:'java&Tab;script:alert(1)'}},
   {...base,extra:{destination:'java%73cript%3Aalert(1)'}},
   {...base,extra:{destination:'\u200Bhttp://example.com/unsafe'}},
   {...base,extra:{destination:' https://example.com/markets'}},
   {...base,extra:{destination:'data&colon;text/plain,unsafe'}},
   {...base,extra:{destination:'\u0000https://example.com/markets'}},
   {...base,extra:{destination:'%2F%2Fexample.com/markets'}},
   {...base,sourceUrl:'\u0000https://example.com/markets'}
  ];
  assert.deepEqual(filterTrendObservations([...bad,base]),[base],country);
  const expected=makeTrendSnapshot(country,'2026-11-24',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-24',[...bad,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
 assert.equal(isEditorialSourceUrlAllowed('\u0000https://example.com/markets'),false);
 assert.equal(isEditorialSourceUrlAllowed('https://example.com/markets'),true);
});


test('raw source paths cannot conceal excluded labels removed by URL normalization',async()=>{
 const rejected=[
  'https:example.com/news','https:///example.com/news',
  'https:\\example.com\\news','https://example.com\\news',
  'https://example.com/porn/../news',
  'https://example.com/%70orn/%2e%2e/news',
  'https://example.com/onlyfans/../news'
 ];
 for(const url of rejected)assert.equal(isEditorialSourceUrlAllowed(url),false,url);
 for(const url of ['https://example.com/news','HTTPS://example.com/news',
  'https://example.com/a/../news','https://example.com/news?q=%D8%A7%D9%84%D9%8A%D9%88%D9%85'])
  assert.equal(isEditorialSourceUrlAllowed(url),true,url);
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T07:00:00Z',sourceUrl:'https://example.com/news'};
  const mixed=[...rejected.map(sourceUrl=>({...base,sourceUrl})),base];
  assert.deepEqual(filterTrendObservations(mixed),[base],country);
  assert.deepEqual(makeTrendSnapshot(country,'2026-11-24',mixed),
   makeTrendSnapshot(country,'2026-11-24',[base]),country);
 }
});


test('named invisible HTML entities cannot conceal excluded media sources before aggregation',()=>{
 const hidden=['only&ZeroWidthSpace;fans','porn&NegativeVeryThinSpace;hub',
  'only&InvisibleTimes;fans','porn&ApplyFunction;hub','only&#x2063;fans',
  'only\u2064fans','porn&amp;NegativeMediumSpace;hub'];
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T08:00:00Z',sourceUrl:'https://example.com/news'};
  const mixed=[base,...hidden.flatMap(label=>[
   {...base,term:label},
   {...base,sourceUrl:'https://example.com/'+label},
   {...base,metadata:{caption:label}}
  ])];
  assert.deepEqual(filterTrendObservations(mixed),[base],country);
  assert.deepEqual(makeTrendSnapshot(country,'2026-11-24',mixed),
   makeTrendSnapshot(country,'2026-11-24',[base]),country);
 }
 const clean={title:'الأسواق&ZeroWidthSpace; المحلية',url:'https://example.com/news?a=1&amp;b=2'};
 assert.deepEqual(filterTrendObservations([clean]),[clean]);
});


test('complete numeric HTML references are screened without truncating zero-padded code points',()=>{
 const hidden=['only&#000000102;ans','p&#x00000006f;rnhub',
  'only&#0000000102;ans','porn&#x0000000200b;hub'];
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T08:00:00Z',sourceUrl:'https://example.com/news'};
  const clean={...base,term:'السوق &#000000065; اليوم'};
  const bad=hidden.flatMap(label=>[
   {...base,term:label},
   {...base,sourceUrl:'https://example.com/'+label},
   {...base,metadata:{caption:label}}
  ]);
  assert.deepEqual(filterTrendObservations([base,clean,...bad]),[base,clean],country);
  assert.deepEqual(makeTrendSnapshot(country,'2026-11-24',[base,clean,...bad]),
   makeTrendSnapshot(country,'2026-11-24',[base,clean]),country);
 }
 for(const label of ['خبر &#999999999999999999999999;','خبر &#x110000;','خبر &#000000000;'])
  assert.deepEqual(filterTrendObservations([{title:label}]),[]);
});

test('supplementary and filler Unicode code points cannot conceal excluded source names',()=>{
 const hidden=[0xE0100,0xE007F,0x115F,0x3164,0x2065].map(point=>'only'+String.fromCodePoint(point)+'fans');
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T10:00:00Z',sourceUrl:'https://example.com/news'};
  const safe={...base,term:'السوق'+String.fromCodePoint(0xE0100)+' المحلي'};
  const bad=hidden.flatMap(label=>[
   {...base,term:label},
   {...base,sourceUrl:'https://example.com/'+encodeURIComponent(label)},
   {...base,metadata:{caption:label}}
  ]);
  assert.deepEqual(filterTrendObservations([base,safe,...bad]),[base,safe],country);
  assert.deepEqual(makeTrendSnapshot(country,'2026-11-24',[base,safe,...bad]),
   makeTrendSnapshot(country,'2026-11-24',[base,safe]),country);
 }
});

test('invisible Unicode cannot hide unsafe destinations in markup or unknown feed metadata',()=>{
 const hidden=[0xE0100,0xE007F,0x2065,0xFE0F].map(point=>'java'+String.fromCodePoint(point)+'script:alert(1)');
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'الأسواق المحلية',source:'google',
   observedAt:'2026-11-24T11:00:00Z',sourceUrl:'https://example.com/news'};
  const safe={...base,metadata:{caption:'مؤشر السوق'+String.fromCodePoint(0xE0100)}};
  const bad=hidden.flatMap(destination=>[
   {...base,description:'<a href="'+destination+'">خبر موثوق</a>'},
   {...base,description:'<img srcset="https://example.com/image.jpg 1x, '+destination+' 2x"> خبر موثوق'},
   {...base,metadata:{caption:destination}}
  ]);
  assert.deepEqual(filterTrendObservations([base,safe,...bad]),[base,safe],country);
  assert.deepEqual(makeTrendSnapshot(country,'2026-11-24',[base,safe,...bad]),
   makeTrendSnapshot(country,'2026-11-24',[base,safe]),country);
 }
});
