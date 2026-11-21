import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const php=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');

test('PHP fallback exposes 22 unique Arab country selectors without claiming every country has published records',()=>{
 const match=php.match(/function atn_lightview_country_codes\(\)\s*\{\s*return array\(([^;]+)\);\s*\}/s);
 assert.ok(match,'country map must remain deterministic');
 const entries=[...match[1].matchAll(/'([a-z]{2})'=>'([^']+)'/g)];
 assert.equal(entries.length,22);
 assert.equal(new Set(entries.map(x=>x[1])).size,22);
 assert.equal(new Set(entries.map(x=>x[2])).size,22);
 const countries=Object.fromEntries(entries.map(x=>[x[1],x[2]]));
 assert.equal(countries.sa,'السعودية');
 assert.equal(countries.eg,'مصر');
 assert.equal(countries.sd,'السودان');
 assert.equal(countries.so,'الصومال');
 assert.equal(countries.dj,'جيبوتي');
 assert.equal(countries.km,'جزر القمر');
 assert.match(php,/22 دولة عربية؛ تظهر الحصائل حيث تتوفر بيانات منشورة/);
 assert.doesNotMatch(php,/18 دولة ضمن أرشيف الرصد/);
});
test('country alignment does not add queries, scheduled jobs or archive cache invalidation',()=>{
 assert.match(php,/posts_per_page'\s*=>\s*320/);
 assert.match(php,/15 \* MINUTE_IN_SECONDS/);
 assert.match(php,/atn_lightview_latest_v9/);
 assert.doesNotMatch(php,/wp_schedule_event\s*\(/);
});
