import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const php=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');

test('archive cards use a safe internal link before caching and revalidate old cache without more queries',()=>{
 assert.match(php,/function atn_lightview_archive_link_allowed\(/);
 const fresh=php.indexOf('if (!atn_lightview_archive_link_allowed($link)) { continue; }');
 const stored=php.indexOf('set_transient($key, $items, 15 * MINUTE_IN_SECONDS)');
 assert.ok(fresh>=0&&stored>fresh);
 assert.match(php,/atn_lightview_archive_link_allowed\(\$item\['link'\]\)/);
 assert.match(php,/\x27link\x27 => \$link,/);
 assert.equal((php.match(/new WP_Query\(/g)||[]).length,1);
 assert.doesNotMatch(php,/wp_schedule_event\s*\(/);
 assert.match(php,/Version: 0\.12\.10/);
});

test('archive link guard permits Saudi and newly supported countries, blocks external and query URLs',t=>{
 const version=spawnSync('php',['-v'],{encoding:'utf8'});
 if(version.error){t.skip('PHP CLI is not installed');return;}
 const fn=php.match(/function atn_lightview_archive_link_allowed\(\$url\) \{[\s\S]*?\n\}/);
 assert.ok(fn,'guard function is extractable');
 const urls=[
  'https://arabiatrend.com/trend-archive/sa-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/eg-music-2026-11-21/',
  'https://arabiatrend.com/trend-archive/sd-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/so-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/dj-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/km-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/topic-abcdefabcdefabcdefabcdef/',
  'https://example.net/trend-archive/sa-search-2026-11-21/',
  'https://arabiatrend.com.example.net/trend-archive/sa-search-2026-11-21/',
  'http://arabiatrend.com/trend-archive/sa-search-2026-11-21/',
  'https://arabiatrend.com/trend-archive/sa-search-2026-11-21/?next=external',
  'https://arabiatrend.com/trend-archive/',
  'https://arabiatrend.com/wp-admin/',
  'https://arabiatrend.com:8443/trend-archive/sa-search-2026-11-21/',
  'https://user:pass@arabiatrend.com/trend-archive/sa-search-2026-11-21/'
 ];
 const code='function wp_parse_url($s){return parse_url($s);}\n'+
  "function home_url($p){return 'https://arabiatrend.com'.$p;}\n"+fn[0]+
  '\necho json_encode(array_map("atn_lightview_archive_link_allowed",'+JSON.stringify(urls)+'));';
 const r=spawnSync('php',['-r',code],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(JSON.parse(r.stdout),[true,true,true,true,true,true,true,false,false,false,false,false,false,false,false]);
});
