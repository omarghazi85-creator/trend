import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

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

test('new country search summaries remain visible as internal archive cards without loosening scope', (t)=>{
 assert.match(php,/if \(!atn_lightview_archive_title_supported\(\$title\)\) \{ continue; \}/);
 const functionText=php.match(/function atn_lightview_archive_title_supported\(\$title\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(functionText,'archive title support check must remain a pure function');
 const titles=[
  'حصيلة كلمات البحث في السودان يوم 2026-11-21',
  'حصيلة كلمات البحث في الصومال يوم 2026-11-21',
  'حصيلة كلمات البحث في جيبوتي يوم 2026-11-21',
  'حصيلة كلمات البحث في جزر القمر يوم 2026-11-21',
  'كلمات البحث الرائجة في السعودية يوم 2026-11-21',
  'كلمات البحث الرائجة في مصر يوم 2026-11-21',
  'الأغاني الأكثر تشغيلًا في مصر',
  'حصيلة ترندات السعودية',
  'الأخبار العامة غير المتعلقة بالأرشيف',
  'سجل الأخبار العادية'
 ];
 const cli=spawnSync('php',['-r',functionText+'\n$input=json_decode(stream_get_contents(STDIN),true); echo json_encode(array_map("atn_lightview_archive_title_supported",$input));'],{
  input:JSON.stringify(titles),encoding:'utf8'
 });
 if(cli.error && (cli.error as NodeJS.ErrnoException).code==='ENOENT'){
  t.diagnostic('PHP CLI unavailable locally; static guard passed and runtime test executes in CI');
  return;
 }
 assert.ifError(cli.error);
 assert.equal(cli.status,0,cli.stderr);
 assert.deepEqual(JSON.parse(cli.stdout),[true,true,true,true,true,true,true,true,false,false]);
 assert.match(php,/Version: 0\.12\.16/);
});
