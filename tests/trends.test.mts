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
