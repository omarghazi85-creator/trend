import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTrendObservations,isEditorialSourceUrlAllowed} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';

test('source admission rejects non-public hosts and normalized numeric or IPv6 loopback URLs',()=>{
 for(const sourceUrl of [
  'https://localhost/news','https://localhost./news','https://collector.local/rss',
  'https://feeds.internal/latest','https://intranet/story','https://127.0.0.1/news',
  'https://127.1/news','https://0x7f000001/news','https://10.0.0.8/news',
  'https://192.168.1.1/news','https://169.254.169.254/meta',
  'https://[::1]/news','https://[::ffff:127.0.0.1]/news'
 ])assert.equal(isEditorialSourceUrlAllowed(sourceUrl),false,sourceUrl);
 for(const sourceUrl of [
  'https://trends.google.com/trends/explore?q=egypt',
  'https://www.example.com/news/Essex-county',
  'https://example.com./business'
 ])assert.equal(isEditorialSourceUrlAllowed(sourceUrl),true,sourceUrl);
});

test('non-public source URLs never enter country snapshots or fingerprints',async()=>{
 for(const country of ['sd','so','dj','km']){
  const base={country,term:'أخبار الاقتصاد المحلي',source:'google',
   observedAt:'2026-11-23T00:30:00Z',sourceUrl:'https://trends.google.com/trends/explore'};
  const invalid=[
   {...base,source:'rss',sourceUrl:'https://localhost/feed'},
   {...base,source:'news',sourceUrl:'https://127.0.0.1/feed'},
   {...base,source:'media',sourceUrl:'https://[::1]/feed'},
   {...base,source:'channel',mediaUrl:'https://feeds.internal/image'}
  ];
  const baseline=makeTrendSnapshot(country,'2026-11-23',[base]);
  const got=makeTrendSnapshot(country,'2026-11-23',[...invalid,base]);
  assert.deepEqual(got,baseline,country);
  assert.equal(await snapshotDigest(got),await snapshotDigest(baseline),country);
  assert.deepEqual(got.terms[0].sources,['google'],country);
 }
});

test('legitimate Saudi and Egyptian source records and distinct media links remain intact',()=>{
 for(const country of ['sa','eg']){
  const original={
   title:'نتائج الرياضة المحلية',country,term:'نتائج الرياضة المحلية',
   source:'google',observedAt:'2026-11-23T00:30:00Z',
   sourceUrl:'https://www.example.com/news',mediaUrl:'https://cdn.example.com/video'
  };
  assert.deepEqual(filterTrendObservations([original]),[original]);
  const snapshot=makeTrendSnapshot(country,'2026-11-23',[original]);
  assert.equal(snapshot.terms.length,1);
  assert.deepEqual(snapshot.terms[0].sources,['google']);
  assert.equal(original.mediaUrl,'https://cdn.example.com/video');
 }
});

test('reserved and malformed DNS names are excluded before six-country aggregation',async()=>{
 const denied=['https://feed.test/rss','https://feed.invalid/rss','https://feed.example/rss',
  'https://media.onion/story','https://gateway.home.arpa/feed','https://feed.alt/news',
  'https://bad_host.example.com/feed','https://-bad.example.com/feed',
  'https://bad-.example.com/feed','https://feed..example.com/feed',
  'https://feed.TEST./rss'];
 for(const url of denied)assert.equal(isEditorialSourceUrlAllowed(url),false,url);
 for(const url of ['https://local-news.example.com/feed','https://test.example.com/feed',
  'https://www.example.com./news','https://أخبار.example.com/feed'])
  assert.equal(isEditorialSourceUrlAllowed(url),true,url);
 for(const country of ['sa','eg','sd','so','dj','km']){
  const base={country,term:'أخبار الأسواق المحلية',source:'google',
   observedAt:'2026-11-26T00:30:00Z',sourceUrl:'https://local-news.example.com/feed',
   mediaUrl:'https://cdn.example.com/photo.jpg'};
  const invalid=denied.flatMap(url=>[{...base,sourceUrl:url},{...base,mediaUrl:url},{...base,extra:{destinationUrl:url}}]);
  assert.deepEqual(filterTrendObservations([...invalid,base]),[base],country);
  const expected=makeTrendSnapshot(country,'2026-11-26',[base]);
  const actual=makeTrendSnapshot(country,'2026-11-26',[...invalid,base]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
 }
});
