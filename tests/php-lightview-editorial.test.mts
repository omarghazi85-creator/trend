import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const php=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');

test('live archive excludes unsafe titles before set_transient, REST and shortcode inherit the filter',()=>{
 assert.match(php,/function atn_lightview_archive_title_allowed\(\$title\)/);
 const preCache=php.indexOf('if (!atn_lightview_archive_title_allowed($title)) { continue; }');
 const save=php.indexOf('set_transient($key, $items, 15 * MINUTE_IN_SECONDS)');
 assert.ok(preCache>0 && save>preCache,'new transient snapshots must contain only permitted titles');
 assert.match(php,/return array_values\(array_filter\(\$items, static function \(\$item\) \{/);
 assert.match(php,/isset\(\$item\['title'\]\) && atn_lightview_archive_title_allowed\(\$item\['title'\]\)/);
 assert.equal((php.match(/function atn_lightview_archive_items\(/g)||[]).length,1);
 assert.match(php,/posts_per_page'\s*=>\s*320/);
 assert.match(php,/atn_lightview_latest_v9/);
 assert.doesNotMatch(php,/wp_schedule_event\s*\(/);
});

test('PHP filtering rejects explicit terms and keeps legitimate trends without false substring matches',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI not installed on CI runner');return;}
 const match=php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}\n(?=function atn_lightview_archive_items\(\))/);
 assert.ok(match,'extract executable PHP guard');
 const script='function wp_strip_all_tags($s){return strip_tags($s);} \n'+match[0]+'\n'+
  'echo json_encode(array_map("atn_lightview_archive_title_allowed", array('+
  '"السودان", "الصومال", "Essex county", "السد ضد لوسيل", "ميا خليفة", '+
  '"&#80;orn clips", "p&#111;rn news", "آمارنا ميلر", "OnlyFans", '+
  '"سيكسي", "أفلام إباحية", "كلمات البحث الرائجة في مصر")));';
 const result=spawnSync('php',['-r',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),[
  true,true,true,true,false,false,false,false,false,false,false,true
 ]);
});
test('PHP archive file passes syntax check when CLI available',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI not installed on CI runner');return;}
 const lint=spawnSync('php',['-l',new URL('../atn-lightview.php',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(lint.status,0,lint.stderr);
});
