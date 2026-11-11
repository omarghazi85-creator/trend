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
