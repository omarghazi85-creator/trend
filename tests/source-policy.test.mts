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