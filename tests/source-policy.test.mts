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
