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
