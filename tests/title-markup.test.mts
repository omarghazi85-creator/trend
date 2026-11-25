import test from 'node:test';
import assert from 'node:assert/strict';
import {isEditorialObservationAllowed} from '../src/trend-policy.mts';
import {makeTrendSnapshot,snapshotDigest} from '../src/trends.mts';

test('hidden and incomplete document fragments cannot enter observation titles or shadow snapshots',async()=>{
 for(const country of ['sa','eg','sd','so','dj','km']){
  const row={country,term:'أخبار الطقس',source:'google',observedAt:'2026-11-25T07:00:00Z'};
  const expected=makeTrendSnapshot(country,'2026-11-25',[row]);
  const bad=[
   'أخبار <textarea>نص مخفي</textarea> الطقس',
   'أخبار <iframe>نص مخفي</iframe> الطقس',
   'أخبار <title>نص مخفي</title> الطقس',
   'أخبار <!-- تعليق غير مكتمل',
   'أخبار &lt;span title=&quot;ناقص',
   'أخبار </span',
   'أخبار <!DOCTYPE html',
   'أخبار <?xml'
  ];
  for(const term of bad){
   assert.equal(isEditorialObservationAllowed({...row,term}),false,country+' '+term);
   assert.equal(isEditorialObservationAllowed({...row,title:term}),false);
   assert.equal(isEditorialObservationAllowed({...row,name:term}),false);
  }
  const actual=makeTrendSnapshot(country,'2026-11-25',[row,...bad.map(term=>({...row,term}))]);
  assert.deepEqual(actual,expected,country);
  assert.equal(await snapshotDigest(actual),await snapshotDigest(expected),country);
  for(const term of ['أخبار <b>الطقس</b>','أخبار <!-- تعليق مكتمل -->الطقس','درجة الحرارة 5 < 10']){
   assert.equal(isEditorialObservationAllowed({...row,term}),true,term);
   assert.equal(makeTrendSnapshot(country,'2026-11-25',[{...row,term}]).terms.length,1,term);
  }
  // The title-only guard must not reject otherwise admissible rich descriptions.
  assert.equal(isEditorialObservationAllowed({...row,description:'<p>أخبار الطقس</p>'}),true);
 }
});
